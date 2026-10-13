"""Synthetic byte fixtures test the audit contract, never real film readiness."""
import contextlib
import hashlib
import io
import json
import runpy
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path

MODULE = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/audit-packaged-endings.py'))


class PackagedAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='fleeting-packaged-audit-')
        cls.project = Path(cls.temporary.name).resolve()
        cls.web = cls.project / 'web'
        cls.apk = cls.project / 'fixture.apk'
        cls.manifest = cls.project / 'generation-manifest.json'
        cls.out = cls.project / 'report.json'
        cls.movies, cls.images, rows = [], [], []
        def source(relative, data):
            file = cls.project / relative
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
            identifier = str(uuid.uuid5(uuid.NAMESPACE_URL, relative))
            Path(str(file) + '.meta').write_text(json.dumps({'uuid': identifier}), encoding='utf-8')
            return {'path': relative, 'sha256': hashlib.sha256(data).hexdigest()}, identifier
        for skin in MODULE['SKINS']:
            for ending in MODULE['IDS']:
                part = '' if skin == 'base' else f'skins/{skin}/'
                # The audit checks byte identity/presence only; these are not decodable films/images.
                data = b'fixture-mp4-byte-contract-' + (skin + '/' + ending).encode()
                movie, identifier = source(f'assets/resources/video/endings/{part}{ending}.mp4', data)
                packed = cls.web / f'assets/resources/native/{identifier[:2]}/{identifier}.1234.mp4'
                packed.parent.mkdir(parents=True, exist_ok=True)
                packed.write_bytes(data)
                cls.movies.append((cls.project / movie['path'], packed))
                frames = []
                for index in range(24):
                    relative = f'assets/resources/art/endings/cinematic/{part}{ending}/{index:02d}.png'
                    frame, identifier = source(relative, b'fixture-source-image-' + relative.encode())
                    frames.append(frame)
                    # Converted Cocos native images may change bytes and extension.
                    packed = cls.web / f'assets/resources/native/{identifier[:2]}/{identifier}.ab12.jpg'
                    packed.parent.mkdir(parents=True, exist_ok=True)
                    packed.write_bytes(b'fixture-transformed-image-' + relative.encode())
                    cls.images.append(packed)
                rows.append({'skin': skin, 'id': ending, **movie, 'seconds': 12, 'fallbackFrames': 24, 'fallbackSha256': frames})
        cls.rows = rows
        cls.manifest.write_text(json.dumps(rows), encoding='utf-8')
        with zipfile.ZipFile(cls.apk, 'w', zipfile.ZIP_DEFLATED) as archive:
            for file in cls.web.rglob('*'):
                if file.is_file():
                    archive.write(file, 'assets/' + file.relative_to(cls.web).as_posix())

    @classmethod
    def tearDownClass(cls):
        target = cls.project.resolve()
        assert target.parent == Path(tempfile.gettempdir()).resolve()
        assert target.name.startswith('fleeting-packaged-audit-')
        cls.temporary.cleanup()

    def audit(self, both=False):
        args = ['--project', str(self.project), '--manifest', str(self.manifest), '--web', str(self.web), '--out', str(self.out)]
        if both:
            args.extend(['--apk', str(self.apk)])
        with contextlib.redirect_stdout(io.StringIO()):
            code = MODULE['main'](args)
        return code, json.loads(self.out.read_text(encoding='utf-8'))

    def test_directory_and_apk_require_all_28_movies_and_672_native_images(self):
        code, report = self.audit(True)
        self.assertEqual(code, 0)
        self.assertEqual(report['sourceMovieCount'], 28)
        for target in report['targets']:
            self.assertEqual(target['matchingMovieCount'], 28)
            self.assertEqual(target['presentFallbackCount'], 672)
            self.assertTrue(all(not frame['packagedByteIdentityChecked'] for frame in target['fallbackFrames']))
        self.assertEqual(len(report['targets']), 2)
        self.assertEqual(report['targets'][1]['apkSha256'], hashlib.sha256(self.apk.read_bytes()).hexdigest())

    def test_matching_uuid_with_stale_movie_bytes_is_rejected(self):
        _, file = self.movies[0]
        original = file.read_bytes()
        try:
            file.write_bytes(b'an old build of the movie')
            code, report = self.audit()
            self.assertEqual(code, 1)
            self.assertEqual(report['targets'][0]['matchingMovieCount'], 27)
        finally:
            file.write_bytes(original)

    def test_json_metadata_without_the_actual_image_does_not_prove_presence(self):
        file = self.images[0]
        original = file.read_bytes()
        metadata = file.with_suffix('.json')
        try:
            file.unlink()
            metadata.write_text('{"declared":true}', encoding='utf-8')
            code, report = self.audit()
            self.assertEqual(code, 1)
            self.assertEqual(report['targets'][0]['presentFallbackCount'], 671)
        finally:
            metadata.unlink()
            file.write_bytes(original)

    def test_a_changed_source_is_rejected_even_if_the_package_matches_the_old_record(self):
        source, _ = self.movies[0]
        original = source.read_bytes()
        try:
            source.write_bytes(b'changed after generation manifest')
            code, report = self.audit()
            self.assertEqual(code, 1)
            self.assertIn('Source changed', report['error'])
        finally:
            source.write_bytes(original)

    def test_early_seven_film_manifest_cannot_pass_the_final_28_film_audit(self):
        try:
            self.manifest.write_text(json.dumps(self.rows[:7]), encoding='utf-8')
            code, report = self.audit()
            self.assertEqual(code, 1)
            self.assertIn('exactly 28', report['error'])
        finally:
            self.manifest.write_text(json.dumps(self.rows), encoding='utf-8')


if __name__ == '__main__':
    unittest.main(verbosity=2)
