#!/bin/bash
# 检查SSH密钥登录问题

echo "=== 1. 检查authorized_keys文件 ==="
if [ -f ~/.ssh/authorized_keys ]; then
    echo "文件存在"
    echo "文件权限："
    ls -la ~/.ssh/authorized_keys
    echo ""
    echo "文件内容（前5行）："
    head -5 ~/.ssh/authorized_keys
    echo ""
    echo "密钥数量："
    wc -l ~/.ssh/authorized_keys
else
    echo "❌ authorized_keys文件不存在！"
fi

echo ""
echo "=== 2. 检查.ssh目录权限 ==="
ls -la ~/.ssh/ 2>/dev/null || echo "❌ .ssh目录不存在"

echo ""
echo "=== 3. 检查SSH配置中的密钥相关设置 ==="
grep -E "AuthorizedKeysFile|PubkeyAuthentication|StrictModes" /etc/ssh/sshd_config

echo ""
echo "=== 4. 检查SSH日志（最近的认证失败记录）==="
tail -20 /var/log/auth.log 2>/dev/null || tail -20 /var/log/secure 2>/dev/null || echo "无法读取日志文件"

echo ""
echo "=== 5. 检查SSH服务是否正常运行 ==="
systemctl status sshd --no-pager | head -3





