#!/usr/bin/env python3
"""CityX 发布入口：本地检查、指定文件提交、推送及精确版本上线确认。"""
import argparse
import glob
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / 'scripts/publish.json').read_text())


def run(*args, capture=False, env=None):
    """不经 shell 执行命令，失败立即停止；不回滚或覆盖用户改动。"""
    result = subprocess.run(args, cwd=ROOT, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None, env=env)
    return result.stdout.strip() if capture else None


def git(*args):
    return run('git', *args, capture=True)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def node_path():
    """优先系统 Node；兼容当前 Mac 的 Codex 内置运行时。"""
    candidate = os.environ.get('CITYX_NODE') or shutil.which('node')
    if not candidate:
        candidate = str(Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
    require(Path(candidate).is_file(), '找不到 Node.js；请设置 CITYX_NODE 为 Node 可执行文件路径。')
    return candidate


def preflight():
    require(git('branch', '--show-current') == CONFIG['branch'], '只能从配置的发布分支执行。')
    remote = git('remote', 'get-url', '--push', 'origin')
    repo = CONFIG['repository']
    require(remote in [f'https://github.com/{repo}.git', f'https://github.com/{repo}',
                       f'git@github.com:{repo}.git'], 'origin 推送地址与发布配置不一致，停止。')
    require(not git('ls-files', '-u'), '存在未解决的合并冲突。')


def check():
    """仅本地检查并生成预览产物，不提交或访问网络。"""
    preflight()
    run('git', 'diff', '--check')
    run('git', 'diff', '--cached', '--check')
    node = node_path()
    tests = sorted(glob.glob(str(ROOT / 'tests/*.test.js')))
    require(bool(tests), '没有找到现有规则测试。')
    run(node, '--test', *tests)
    run(node, 'scripts/build-pages.mjs')
    print('检查通过。构建使用当前工作区；最终线上版本以提交后的 Actions 构建为准。', flush=True)


def read_url(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'cityx-publish', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read().decode()


def status(wait_seconds):
    """只认当前 HEAD 的部署和网页版本；每次最多短等候，便于及时报告进度。"""
    sha = git('rev-parse', 'HEAD')
    query = urllib.parse.urlencode({'head_sha': sha, 'branch': CONFIG['branch'], 'per_page': 5})
    api = f"https://api.github.com/repos/{CONFIG['repository']}/actions/workflows/pages.yml/runs?{query}"
    deadline = time.monotonic() + wait_seconds
    while True:
        runs = json.loads(read_url(api))['workflow_runs']
        current = next((r for r in runs if r['head_sha'] == sha), None)
        if current:
            print(f"{sha[:12]}: {current['status']} / {current['conclusion']}\n{current['html_url']}", flush=True)
            if current['status'] == 'completed':
                require(current['conclusion'] == 'success', '该版本的 Actions 未成功。请检查运行日志；不要重复推送或覆盖历史。')
                try:
                    html = read_url(CONFIG['site'] + '?release=' + sha[:12])
                except urllib.error.HTTPError as error:
                    if error.code != 404:
                        raise
                    html = ''
                if f'版本 {sha[:12]}' in html:
                    print(f"已上线并确认版本 {sha[:12]}：{CONFIG['site']}", flush=True)
                    return 0
                print('Actions 成功，但网页尚未确认到该版本。', flush=True)
        else:
            print('尚未找到当前 HEAD 的发布任务；本地提交可能还未推送。', flush=True)
        if time.monotonic() >= deadline:
            print('未确认上线。稍后运行 status 继续检查；不会再次提交或推送。', flush=True)
            return 2
        time.sleep(min(10, max(0, deadline - time.monotonic())))


def publish(args):
    """用户明确要求发布后调用；仅提交逐项指定的文件，绝不自动 git add -A。"""
    preflight()
    require(not git('diff', '--cached', '--name-only'), '已有暂存内容，请先审阅并处理，脚本不会混入提交。')
    selected = set()
    for name in args.files:
        path = Path(name)
        require(not path.is_absolute() and '..' not in path.parts and name != '.', '文件必须是项目内的相对文件路径。')
        require(not (ROOT / path).is_dir(), '请逐个指定文件，不接受整个目录。')
        selected.add(path.as_posix())
    tracked_changes = set(git('diff', '--name-only').splitlines())
    require(tracked_changes <= selected, '存在未纳入本次发布的已跟踪改动：' + ', '.join(sorted(tracked_changes - selected)))
    require(not selected or bool(args.message), '提交文件时必须提供 --message。')
    check()
    # 仅快进发布：远端领先或分叉时停止，避免自动合并、重置和强推。
    run('git', 'fetch', 'origin', CONFIG['branch'])
    run('git', 'merge-base', '--is-ancestor', f"origin/{CONFIG['branch']}", 'HEAD')
    if selected:
        run('git', '--literal-pathspecs', 'add', '--', *sorted(selected))
        if git('diff', '--cached', '--name-only'):
            env = dict(os.environ)
            for role in ('AUTHOR', 'COMMITTER'):
                env[f'GIT_{role}_NAME'] = CONFIG['author_name']
                env[f'GIT_{role}_EMAIL'] = CONFIG['author_email']
            run('git', 'commit', '-m', args.message, env=env)
    require(not git('diff', '--name-only'), '提交后工作区又发生变动，停止推送。')
    run('git', 'push', 'origin', f"HEAD:refs/heads/{CONFIG['branch']}")
    print('推送完成，开始查询本次提交的部署状态。', flush=True)
    return status(args.wait_seconds)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('check', help='只做本地检查，不提交或发布')
    state = sub.add_parser('status', help='只查询当前 HEAD 的部署和线上版本')
    state.add_argument('--wait-seconds', type=int, choices=range(0, 46), default=0, metavar='0..45')
    release = sub.add_parser('publish', help='用户明确要求发布后：检查、提交选定文件、推送')
    release.add_argument('--message')
    release.add_argument('--files', nargs='*', default=[])
    release.add_argument('--wait-seconds', type=int, choices=range(0, 46), default=30, metavar='0..45')
    args = parser.parse_args()
    if args.command == 'check':
        check()
        return 0
    if args.command == 'status':
        return status(args.wait_seconds)
    return publish(args)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.CalledProcessError, urllib.error.URLError, OSError) as error:
        print(f'停止：{error}', file=sys.stderr)
        sys.exit(1)
