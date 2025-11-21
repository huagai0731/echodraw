#!/bin/bash
# 检查SSH连接问题的其他可能原因

echo "=== 1. 检查SSH服务是否正在监听端口7731 ==="
netstat -tlnp | grep 7731 || ss -tlnp | grep 7731 || echo "❌ 端口7731未监听"

echo ""
echo "=== 2. 检查防火墙状态 ==="
# 检查firewalld
if systemctl is-active --quiet firewalld; then
    echo "firewalld运行中"
    firewall-cmd --list-ports 2>/dev/null
    firewall-cmd --list-all 2>/dev/null | grep -E "ports|services"
else
    echo "firewalld未运行"
fi

# 检查iptables
if command -v iptables &> /dev/null; then
    echo ""
    echo "iptables规则（SSH相关）："
    iptables -L -n | grep -E "7731|ssh" || echo "无相关规则"
fi

echo ""
echo "=== 3. 检查SSH服务状态 ==="
systemctl status sshd --no-pager | head -10

echo ""
echo "=== 4. 检查SSH最近日志（查看连接尝试）==="
tail -30 /var/log/auth.log 2>/dev/null || tail -30 /var/log/secure 2>/dev/null || echo "无法读取日志"

echo ""
echo "=== 5. 检查SELinux状态（如果启用可能阻止连接）==="
getenforce 2>/dev/null || echo "SELinux未安装或未启用"



