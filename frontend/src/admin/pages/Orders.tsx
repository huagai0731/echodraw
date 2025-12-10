import { useEffect, useMemo, useState, useCallback } from "react";
import { listOrders, queryAndSyncOrder } from "@/admin/api";
import type { AdminOrder } from "@/admin/api";
import MaterialIcon from "@/components/MaterialIcon";
import api from "@/services/api";

import "../styles/Orders.css";

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

function formatAmount(amount: string): string {
  const num = parseFloat(amount);
  return `¥${num.toFixed(2)}`;
}

function getStatusClass(status: string): string {
  switch (status) {
    case "paid":
      return "status status--success";
    case "pending":
      return "status status--warning";
    case "failed":
      return "status status--error";
    case "cancelled":
      return "status status--disabled";
    default:
      return "status";
  }
}

function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [syncingOrders, setSyncingOrders] = useState<Set<number>>(new Set());

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listOrders();
      setOrders(data);
    } catch (err) {
      console.error("加载订单失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleQueryAndSync = useCallback(async (orderId: number, orderNumber: string) => {
    if (syncingOrders.has(orderId)) {
      return;
    }

    setSyncingOrders((prev) => new Set(prev).add(orderId));

    try {
      const result = await queryAndSyncOrder(orderId);
      if (result.success) {
        alert(result.message || "订单状态已同步");
        // 重新加载订单列表
        await loadOrders();
      } else {
        alert(result.message || "同步失败");
      }
    } catch (error: any) {
      console.error("查询并同步订单失败:", error);
      const errorMessage = error?.response?.data?.detail || error?.message || "查询并同步订单失败";
      alert(errorMessage);
    } finally {
      setSyncingOrders((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }, [syncingOrders, loadOrders]);

  const filteredOrders = useMemo(() => {
    if (!search.trim()) {
      return orders;
    }
    const keyword = search.toLowerCase();
    return orders.filter(
      (order) =>
        order.order_number.toLowerCase().includes(keyword) ||
        order.user_email.toLowerCase().includes(keyword) ||
        order.payment_transaction_id?.toLowerCase().includes(keyword) ||
        order.status_display.includes(keyword) ||
        order.payment_method_display.includes(keyword)
    );
  }, [orders, search]);

  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter((o) => o.status === "paid").length;
    const pending = orders.filter((o) => o.status === "pending").length;
    const failed = orders.filter((o) => o.status === "failed").length;
    const totalAmount = orders
      .filter((o) => o.status === "paid")
      .reduce((sum, o) => sum + parseFloat(o.amount), 0);

    return { total, paid, pending, failed, totalAmount };
  }, [orders]);

  return (
    <div className="admin-orders">
      <header className="admin-orders__header">
        <h2>订单管理</h2>
        <div className="admin-orders__stats">
          <div className="admin-orders__stat">
            <span className="admin-orders__stat-label">总订单</span>
            <span className="admin-orders__stat-value">{stats.total}</span>
          </div>
          <div className="admin-orders__stat">
            <span className="admin-orders__stat-label">已支付</span>
            <span className="admin-orders__stat-value admin-orders__stat-value--success">{stats.paid}</span>
          </div>
          <div className="admin-orders__stat">
            <span className="admin-orders__stat-label">待支付</span>
            <span className="admin-orders__stat-value admin-orders__stat-value--warning">{stats.pending}</span>
          </div>
          <div className="admin-orders__stat">
            <span className="admin-orders__stat-label">失败</span>
            <span className="admin-orders__stat-value admin-orders__stat-value--error">{stats.failed}</span>
          </div>
          <div className="admin-orders__stat">
            <span className="admin-orders__stat-label">总金额</span>
            <span className="admin-orders__stat-value admin-orders__stat-value--amount">
              {formatAmount(stats.totalAmount.toString())}
            </span>
          </div>
        </div>
      </header>

      <section className="admin-orders__filters">
        <div className="admin-orders__search">
          <MaterialIcon name="search" />
          <input
            type="text"
            placeholder="搜索订单号、用户邮箱、交易号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      <section className="admin-orders__list">
        {loading ? (
          <div className="admin-orders__loading">
            <div className="admin-orders__spinner" />
            <span>正在加载订单...</span>
          </div>
        ) : (
          <div className="admin-orders__table-wrapper">
            <table className="admin-orders__table">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>用户邮箱</th>
                  <th>金额</th>
                  <th>支付方式</th>
                  <th>状态</th>
                  <th>交易号</th>
                  <th>支付时间</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td className="admin-orders__empty" colSpan={9}>
                      {search ? "没有找到匹配的订单" : "暂无订单"}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td data-title="订单号" className="admin-orders__order-number">
                        {order.order_number}
                      </td>
                      <td data-title="用户邮箱" className="admin-orders__email">
                        {order.user_email}
                      </td>
                      <td data-title="金额" className="admin-orders__amount">
                        {formatAmount(order.amount)}
                      </td>
                      <td data-title="支付方式">{order.payment_method_display}</td>
                      <td data-title="状态">
                        <span className={getStatusClass(order.status)}>{order.status_display}</span>
                      </td>
                      <td data-title="交易号" className="admin-orders__transaction-id">
                        {order.payment_transaction_id || "—"}
                      </td>
                      <td data-title="支付时间">{formatDate(order.paid_at)}</td>
                      <td data-title="创建时间">{formatDate(order.created_at)}</td>
                      <td data-title="操作" className="admin-orders__actions">
                        {order.status === "pending" && order.payment_method === "alipay" && (
                          <button
                            type="button"
                            className="admin-orders__sync-btn"
                            onClick={() => handleQueryAndSync(order.id, order.order_number)}
                            disabled={syncingOrders.has(order.id)}
                            title="查询支付宝订单状态并同步"
                          >
                            <MaterialIcon name="sync" />
                            {syncingOrders.has(order.id) ? "同步中..." : "查询同步"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default OrdersPage;

