"""Import the reproducible film renderer whose command-line file has a hyphen."""
import importlib.util
from pathlib import Path
def ending_module():
    path=Path(__file__).with_name('generate-ending-films.py');spec=importlib.util.spec_from_file_location('ending_films',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
