import { useEffect, useMemo, useState, useRef } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import { fetchInspirationNotes, type InspirationNoteRecord } from "@/services/api";
import { formatISODateInShanghai } from "@/utils/dateUtils";
import { InspirationUploadModal, INSPIRATION_RECORDS_CHANGED_EVENT } from "./Calendar/InspirationUploadModal";
import { InspirationItem } from "./Calendar/InspirationItem";
import { DateSeparator } from "./Calendar/DateSeparator";
import { distributeRecords } from "./Calendar/masonryUtils";
import "./Calendar.css";

type CalendarProps = {
  onBack: () => void;
  onOpenUpload?: (date?: string) => void;
};

function Calendar({ onBack, onOpenUpload: _onOpenUpload }: CalendarProps) {
  const [records, setRecords] = useState<InspirationNoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const fabRef = useRef<HTMLButtonElement>(null);

  // 获取灵感记录（完全独立的API，与画集无关）
  useEffect(() => {
    async function loadRecords() {
      setLoading(true);
      try {
        const allRecords = await fetchInspirationNotes(true, false);
        setRecords(allRecords);
      } catch (error) {
        console.warn("Failed to load inspiration records:", error);
        setRecords([]);
      } finally {
        setLoading(false);
      }
    }
    loadRecords();

    // 监听灵感记录更新事件（与画集上传事件完全分离）
    const handleInspirationChanged = () => {
      loadRecords();
    };
    window.addEventListener(INSPIRATION_RECORDS_CHANGED_EVENT, handleInspirationChanged);
    return () => {
      window.removeEventListener(INSPIRATION_RECORDS_CHANGED_EVENT, handleInspirationChanged);
    };
  }, []);

  // 按日期组织灵感记录（完全独立的数据，与画集无关）
  const recordsByDate = useMemo(() => {
    const map = new Map<string, InspirationNoteRecord[]>();
    
    records.forEach((record) => {
      const recordDate = formatISODateInShanghai(new Date(record.uploaded_at));
      if (recordDate) {
        if (!map.has(recordDate)) {
          map.set(recordDate, []);
        }
        map.get(recordDate)!.push(record);
      }
    });
    return map;
  }, [records]);

  // 按日期排序，最新的在前
  const sortedDates = useMemo(() => {
    return Array.from(recordsByDate.keys()).sort((a, b) => {
      return b.localeCompare(a); // 降序，最新的在前
    });
  }, [recordsByDate]);

  // 为每个日期分配记录到左右两栏
  const dateColumns = useMemo(() => {
    const result: Record<string, { left: InspirationNoteRecord[]; right: InspirationNoteRecord[] }> = {};
    sortedDates.forEach((date) => {
      const dateRecords = recordsByDate.get(date) || [];
      // 按上传时间排序，最新的在前
      const sortedRecords = [...dateRecords].sort((a, b) => {
        return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
      });
      result[date] = distributeRecords(sortedRecords);
    });
    return result;
  }, [sortedDates, recordsByDate]);

  const handleAddRecord = () => {
    setUploadModalOpen(true);
  };

  const handleUploadSuccess = () => {
    // 重新加载灵感记录，强制刷新（清除缓存）
    async function loadRecords() {
      setLoading(true);
      try {
        // 强制刷新，清除缓存
        const allRecords = await fetchInspirationNotes(false, true);
        setRecords(allRecords);
      } catch (error) {
        console.warn("Failed to load inspiration records:", error);
        setRecords([]);
      } finally {
        setLoading(false);
      }
    }
    loadRecords();
  };

  return (
    <div className="calendar-page">
      <div className="calendar-page__background">
        <div className="calendar-page__glow calendar-page__glow--primary" />
        <div className="calendar-page__glow calendar-page__glow--secondary" />
      </div>

      <TopNav
        title="今日灵感"
        subtitle="Today's Inspiration"
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onBack,
        }}
      />

      <main className="calendar-page__content">
        {loading ? (
          <p className="calendar-page__empty">加载中...</p>
        ) : sortedDates.length === 0 ? (
          <p className="calendar-page__empty">暂无记录，点击右下角按钮上传你的第一条灵感吧！</p>
        ) : (
          <div className="calendar-page__masonry">
            <div className="calendar-page__masonry-column">
              {(() => {
                let globalIndex = 0;
                return sortedDates.map((date) => {
                  const columns = dateColumns[date];
                  if (!columns) return null;
                  return (
                    <div key={date} className="calendar-page__date-group">
                      <DateSeparator date={date} />
                      {columns.left.map((record) => {
                        const index = globalIndex++;
                        return (
                          <InspirationItem
                            key={record.id}
                            record={record}
                            index={index}
                          />
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="calendar-page__masonry-column">
              {(() => {
                // 先计算左栏的总数
                let leftTotalCount = 0;
                sortedDates.forEach((date) => {
                  const columns = dateColumns[date];
                  if (columns) {
                    leftTotalCount += columns.left.length;
                  }
                });
                
                let globalIndex = leftTotalCount;
                return sortedDates.map((date) => {
                  const columns = dateColumns[date];
                  if (!columns) return null;
                  return (
                    <div key={date} className="calendar-page__date-group">
                      {columns.right.map((record) => {
                        const index = globalIndex++;
                        return (
                          <InspirationItem
                            key={record.id}
                            record={record}
                            index={index}
                          />
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        <button
          ref={fabRef}
          type="button"
          className="calendar-page__fab"
          onClick={handleAddRecord}
        >
          <MaterialIcon name="add" className="calendar-page__fab-icon" />
        </button>
      </main>

      <InspirationUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}

export default Calendar;

