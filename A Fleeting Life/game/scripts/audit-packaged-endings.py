"""Audit final source manifests against actual Cocos Web files / APK ZIP entries.

Standard library only. This proves packaged resource presence and MP4 byte
identity, never native playback, image conversion identity, or media decoding.
"""
import argparse
from collections import defaultdict
import hashlib
import json
import re
import sys
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

IDS = ('morning', 'backrow', 'outside', 'desk', 'secondGrade', 'runaway', 'wall')
SKINS = ('base', 'waistJacket', 'raincoat', 'namelessNotebook')
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.pvr', '.ktx', '.ktx2', '.astc', '.pkm', '.dds'}
BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'


def sha256(stream):
    digest = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(block)
    return digest.hexdigest()


def compressed_uuid(value):
    """Cocos preserves the first two hex characters, then packs three into two."""
    raw = uuid.UUID(value).hex
    return raw[:2] + ''.join(BASE64[int(raw[i:i + 3], 16) >> 6] +
                            BASE64[int(raw[i:i + 3], 16) & 63] for i in range(2, 32, 3))


def read_json(file):
    return json.loads(Path(file).read_text(encoding='utf-8-sig'))


def source_asset(project, relative, expected_hash, kind):
    file = (project / relative).resolve()
    file.relative_to(project)  # Source manifests may not read outside the project.
    if not re.fullmatch('[0-9a-fA-F]{64}', expected_hash or ''):
        raise ValueError(f'Invalid manifest SHA256: {relative}')
    with file.open('rb') as stream:
        actual = sha256(stream)
    if actual != expected_hash.lower():
        raise ValueError(f'Source changed after generation manifest: {relative}')
    meta = read_json(str(file) + '.meta')
    identifier = str(uuid.UUID(meta['uuid']))
    return {'kind': kind, 'sourcePath': file.relative_to(project).as_posix(),
            'uuid': identifier, 'sourceSha256': actual, 'sourceBytes': file.stat().st_size}


def load_sources(project, manifest, manifest_dir=None):
    if manifest_dir:
        inputs = [manifest_dir / skin / f'{ending}-manifest.json' for skin in SKINS for ending in IDS]
        rows = [read_json(file) for file in inputs]
    else:
        inputs = [manifest]
        rows = read_json(manifest)
        if isinstance(rows, dict):
            rows = rows.get('films', rows.get('rows'))
    expected = {(skin, ending) for skin in SKINS for ending in IDS}
    if not isinstance(rows, list) or len(rows) != 28:
        raise ValueError('Final generation manifest must contain exactly 28 rows (7 endings × 4 outfits).')
    keys = [(row.get('skin'), row.get('id')) for row in rows]
    if len(set(keys)) != 28 or set(keys) != expected:
        raise ValueError('Final generation manifest has missing, duplicate or unexpected ending/outfit pairs.')
    films, assets = [], []
    for row in rows:
        ending, skin = row['id'], row['skin']
        outfit_path = '' if skin == 'base' else f'skins/{skin}/'
        expected_movie = f'assets/resources/video/endings/{outfit_path}{ending}.mp4'
        if row['path'].replace('\\', '/') != expected_movie:
            raise ValueError(f'Unexpected source movie path: {skin}/{ending}')
        if row.get('seconds') != 12 or row.get('fallbackFrames') != 24:
            raise ValueError(f'Final source manifest must describe 12 seconds and 24 fallback frames: {skin}/{ending}')
        movie = source_asset(project, row['path'], row['sha256'], 'mp4')
        movie.update(id=ending, skin=skin)
        fallback_root = f'assets/resources/art/endings/cinematic/{outfit_path}{ending}/'
        frames = row.get('fallbackSha256', [])
        expected_frames = {fallback_root + f'{i:02d}.png' for i in range(24)}
        if len(frames) != 24 or {frame['path'].replace('\\', '/') for frame in frames} != expected_frames:
            raise ValueError(f'Fallback manifest must describe each frame 00–23 exactly once: {skin}/{ending}')
        fallback = []
        for frame in sorted(frames, key=lambda item: item['path']):
            asset = source_asset(project, frame['path'], frame['sha256'], 'fallback-image')
            asset.update(id=ending, skin=skin, frame=int(Path(frame['path']).stem))
            fallback.append(asset)
        films.append({'id': ending, 'skin': skin, 'movie': movie, 'fallbackFrames': fallback})
        assets.extend([movie, *fallback])
    if len({asset['uuid'] for asset in assets}) != len(assets):
        raise ValueError('Source .meta UUIDs are not unique; distinct assets cannot be proved by UUID.')
    return films, [str(file.resolve()) for file in inputs]


class Target:
    def __init__(self, file, archive=False):
        self.file, self.archive = Path(file).resolve(), archive
        self.zip = zipfile.ZipFile(self.file) if archive else None
        self.hashes = {}
        if archive:
            entries = [item for item in self.zip.infolist() if not item.is_dir()]
            if len({item.filename for item in entries}) != len(entries):
                self.zip.close()
                raise ValueError('APK contains duplicate ZIP entry names; resource lookup is ambiguous.')
            self.files = {item.filename: item.file_size for item in entries}
        else:
            if not self.file.is_dir():
                raise ValueError(f'Packaged Web directory does not exist: {self.file}')
            self.files = {item.relative_to(self.file).as_posix(): item.stat().st_size
                          for item in self.file.rglob('*') if item.is_file()}
        # Index native IDs and path suffixes once. Hundreds of fallback frames
        # must not each walk every filename in a multi-thousand-asset build.
        self.by_uuid, self.by_path = defaultdict(dict), defaultdict(dict)
        identifier = re.compile(r'^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32}|[0-9a-fA-F]{2}[A-Za-z0-9+_\-]{20})(?=[.@])')
        for name, size in self.files.items():
            extension = Path(name).suffix.lower()
            if size <= 0 or extension != '.mp4' and extension not in IMAGE_EXTENSIONS:
                continue
            kind = 'mp4' if extension == '.mp4' else 'fallback-image'
            lower = name.replace('\\', '/').lower()
            entry = {'path': name, 'bytes': size}
            for suffix in [lower, *(lower[i + 1:] for i, char in enumerate(lower) if char == '/')]:
                self.by_path[(kind, suffix)][name] = entry
            match = identifier.match(Path(name).name)
            if match:
                self.by_uuid[(kind, match[1].lower())][name] = entry

    def close(self):
        if self.zip:
            self.zip.close()

    def digest(self, name):
        if name not in self.hashes:
            with (self.zip.open(name) if self.zip else (self.file / name).open('rb')) as stream:
                self.hashes[name] = sha256(stream)
        return self.hashes[name]

    def locate(self, asset):
        relative = asset['sourcePath'].split('assets/resources/', 1)[1].lower()
        forms = [asset['uuid'], uuid.UUID(asset['uuid']).hex, compressed_uuid(asset['uuid'])]
        # URL-safe compressed IDs use underscore/hyphen for slash/plus.
        forms.extend([forms[-1].replace('/', '_').replace('+', '-'), forms[-1].replace('/', '_')])
        found = {}
        for form in forms:
            for name, entry in self.by_uuid[(asset['kind'], form.lower())].items():
                found[name] = {**entry, 'locatedBy': 'source-meta-uuid'}
        for name, entry in self.by_path[(asset['kind'], relative)].items():
            found[name] = {**entry, 'locatedBy': 'resource-path'}
        return sorted(found.values(), key=lambda item: item['path'])


def audit_target(target, films, label):
    movies, images = [], []
    for film in films:
        movie = film['movie']
        located = target.locate(movie)
        for match in located:
            match['sha256'] = target.digest(match['path'])
            match['matchesSourceAndManifest'] = match['sha256'] == movie['sourceSha256']
        movies.append({**movie, 'packagedFiles': located,
                       'matchesSourceAndManifest': bool(located) and all(item['matchesSourceAndManifest'] for item in located)})
        for image in film['fallbackFrames']:
            matches = target.locate(image)
            images.append({'id': image['id'], 'skin': image['skin'], 'frame': image['frame'],
                           'sourcePath': image['sourcePath'], 'uuid': image['uuid'],
                           'packagedFiles': matches, 'present': bool(matches),
                           'packagedByteIdentityChecked': False})
    movie_count = sum(movie['matchesSourceAndManifest'] for movie in movies)
    image_count = sum(image['present'] for image in images)
    result = {'target': label, 'path': str(target.file), 'format': 'APK ZIP' if target.archive else 'Cocos Web directory',
              'passed': movie_count == 28 and image_count == 672, 'expectedMovieCount': 28,
              'matchingMovieCount': movie_count, 'expectedFallbackCount': 672, 'presentFallbackCount': image_count,
              'movies': movies, 'fallbackFrames': images,
              'scope': 'Actual files/ZIP entries. MP4 bytes must match the current source and final generation manifest. '
                       'Fallback image presence is matched by UUID/path only; imported/compressed image byte identity is not claimed. '
                       'No media decode, runtime asset-resolution, native video playback or device performance proof.'}
    if target.archive:
        with target.file.open('rb') as stream:
            result['apkSha256'] = sha256(stream)
        result['apkBytes'] = target.file.stat().st_size
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--manifest', type=Path, help='Final aggregate 28-row generation-manifest.json.')
    parser.add_argument('--manifest-dir', type=Path, help='Alternatively read 28 per-film {skin}/{id}-manifest.json records.')
    parser.add_argument('--web', type=Path, help='Completed Cocos Web directory; never a currently running build.')
    parser.add_argument('--apk', type=Path, help='Completed APK; read ZIP entries without extracting.')
    parser.add_argument('--out', type=Path)
    args = parser.parse_args(argv)
    if not args.web and not args.apk:
        parser.error('Provide --web and/or --apk.')
    if args.manifest and args.manifest_dir:
        parser.error('Use --manifest or --manifest-dir, not both.')
    project = args.project.resolve()
    manifest = args.manifest or project / 'build/qa/ending-films/generation-manifest.json'
    output = args.out or project / 'build/qa/ending-films/packaged-resource-audit.json'
    report = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'passed': False,
              'project': str(project), 'targets': [],
              'scope': 'Packaged resource audit only. Native/real-device playback and transformed image byte identity are not proved.'}
    try:
        films, inputs = load_sources(project, manifest, args.manifest_dir)
        report.update(manifestInputs=inputs, sourceMovieCount=len(films), sourceFallbackCount=sum(len(film['fallbackFrames']) for film in films),
                      sourceHashesMatchFinalManifest=True)
        for label, file, archive in [('cocos-web', args.web, False), ('android-apk', args.apk, True)]:
            if not file:
                continue
            target = None
            try:
                target = Target(file, archive)
                report['targets'].append(audit_target(target, films, label))
            except Exception as error:
                report['targets'].append({'target': label, 'path': str(file.resolve()), 'passed': False, 'error': str(error)})
            finally:
                if target:
                    target.close()
        report['passed'] = all(target['passed'] for target in report['targets'])
    except Exception as error:
        report['error'] = str(error)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'sources': report.get('sourceMovieCount', 0),
                      'targets': [{key: target.get(key) for key in ('target', 'passed', 'matchingMovieCount', 'presentFallbackCount', 'error')}
                                  for target in report['targets']], 'error': report.get('error'), 'report': str(output.resolve())}, ensure_ascii=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
