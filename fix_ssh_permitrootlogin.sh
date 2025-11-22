#!/bin/bash
# 修复SSH配置，允许root密码登录

# 备份配置文件
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)

# 修改PermitRootLogin为yes（允许密码登录）
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config

# 确保PasswordAuthentication是yes
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config

# 确保PubkeyAuthentication是yes（同时支持密钥和密码）
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# 验证修改
echo "=== 修改后的关键配置 ==="
grep -E "PermitRootLogin|PasswordAuthentication|PubkeyAuthentication" /etc/ssh/sshd_config

# 重启SSH服务
echo ""
echo "正在重启SSH服务..."
systemctl restart sshd

# 检查SSH服务状态
echo ""
echo "=== SSH服务状态 ==="
systemctl status sshd --no-pager | head -5

echo ""
echo "配置修改完成！现在可以使用密码登录了。"





