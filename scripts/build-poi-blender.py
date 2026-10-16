"""逐个制作POI品质样板；三态同址，昼夜共用模型，不读取主游戏。

Blender --background --factory-startup --python-exit-code 1 --python scripts/build-poi-blender.py -- --asset school --state abandoned --render
"""
from pathlib import Path
import argparse
import importlib
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import poi_quality as q

parser = argparse.ArgumentParser()
parser.add_argument('--asset', required=True)
parser.add_argument('--state', choices=('abandoned','intact','connected'), default='intact')
parser.add_argument('--render', action='store_true')
parser.add_argument('--samples', type=int, default=96)
parser.add_argument('--size', type=int, default=1440)
options = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
builder = importlib.import_module('poi_'+options.asset.replace('-','_'))
q.initialize(options, builder.INFO)
builder.build(q)
q.finish(options)
