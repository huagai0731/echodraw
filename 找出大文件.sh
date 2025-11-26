#!/bin/bash
# 找出 Git 历史中最大的文件

echo "========================================"
echo "查找 Git 历史中的大文件"
echo "========================================"
echo ""

echo "方法 1: 列出所有对象及其大小..."
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  awk '/^blob/ {print substr($0,6)}' | \
  sort -k2 -n -r | \
  head -20 | \
  while read hash size path; do
    size_mb=$(echo "scale=2; $size/1024/1024" | bc)
    if (( $(echo "$size_mb > 1" | bc -l) )); then
      echo "$size_mb MB - $path"
    fi
  done

echo ""
echo "方法 2: 使用 git verify-pack 查找大对象..."
git verify-pack -v .git/objects/pack/*.idx | \
  sort -k 3 -n -r | \
  head -20 | \
  while read hash type size size_delta offset depth base_hash rest; do
    size_mb=$(echo "scale=2; $size/1024/1024" | bc)
    if (( $(echo "$size_mb > 1" | bc -l) )); then
      # 获取文件名
      file=$(git rev-list --objects --all | grep "^$hash" | cut -d' ' -f2)
      echo "$size_mb MB - $file ($hash)"
    fi
  done

echo ""
echo "方法 3: 检查具体的文件路径..."
echo "检查 db.sqlite3:"
git log --all --pretty=format: --name-only --diff-filter=A | grep -E "db.sqlite3" | sort -u

echo ""
echo "检查 echodraw-master:"
git log --all --pretty=format: --name-only --diff-filter=A | grep -E "echodraw-master" | sort -u

echo ""
echo "检查字体文件:"
git log --all --pretty=format: --name-only --diff-filter=A | grep -E "\.ttf$" | sort -u

