"""两塔及旧人类机械体的独立品质样板；不读取主游戏。

Blender --background --factory-startup --python-exit-code 1 --python scripts/build-machinery-blender.py -- --asset purification-tower --render
"""
from pathlib import Path
import argparse
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import machinery_quality as m
import machinery_models as models

parser = argparse.ArgumentParser()
parser.add_argument('--asset', choices=tuple(models.INFO), required=True)
parser.add_argument('--render', action='store_true')
parser.add_argument('--samples', type=int, default=96)
parser.add_argument('--size', type=int, default=1440)
options = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
m.initialize(options, models.INFO[options.asset])
models.BUILD[options.asset](m)
m.finish(options)
