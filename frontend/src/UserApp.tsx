import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";

import BottomNav, { type NavId } from "@/components/BottomNav";
import { CircularRevealWrapper } from "@/components/CircularRevealWrapper";
import { ArtisticLoader } from "@/components/ArtisticLoader";

// 懒加载页面组件
const Gallery = lazy(() => import("@/pages/Gallery"));
const Goals = lazy(() => import("@/pages/Goals"));
const Home = lazy(() => import("@/pages/Home"));
const MentalStateAssessment = lazy(() => import("@/pages/MentalStateAssessment"));
const Reports = lazy(() => import("@/pages/Reports"));
const Profile = lazy(() => import("@/pages/Profile"));
const TestList = lazy(() => import("@/pages/TestList"));
const TestTaking = lazy(() => import("@/pages/TestTaking"));
const TestResults = lazy(() => import("@/pages/TestResults"));
const ColorPerceptionTest = lazy(() => import("@/pages/ColorPerceptionTest"));
const ColorTestResults = lazy(() => import("@/pages/ColorTestResults"));
const VisualAnalysis = lazy(() => import("@/pages/VisualAnalysis"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Upload = lazy(() => import("@/pages/Upload"));

// 导入类型和常量（不需要懒加载）
import type { UploadResult } from "@/pages/Upload";
import { INITIAL_ARTWORKS, type Artwork } from "@/pages/Gallery";
import {
  API_BASE_URL,
  AUTH_FORCED_LOGOUT_EVENT,
    AUTH_CHANGED_EVENT,
  CHECK_IN_STATUS_CHANGED_EVENT,
  createUserUpload,
  deleteUserUpload,
  updateUserUpload,
  checkUploadLimit,
  fetchUserUploads,
  fetchMoods,
  hasAuthToken,
  fetchProfilePreferences,
  type UserUploadRecord,
} from "@/services/api";
import { clearCache } from "@/utils/apiCache";
import {
  formatDateKey,
  isUserArtwork,
  persistStoredArtworks,
  USER_ARTWORKS_CHANGED_EVENT,
  USER_ARTWORK_STORAGE_KEY,
} from "@/services/artworkStorage";
import { addFeaturedArtworkId, removeFeaturedArtworkId } from "@/services/featuredArtworks";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";
import { formatISODateInShanghai, getTodayInShanghai } from "@/utils/dateUtils";

import "./App.css";

// 页面加载占位符
function PageLoadingFallback() {
  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center", 
      minHeight: "50vh"
    }}>
      <ArtisticLoader size="medium" />
    </div>
  );
}

const LOCAL_LAST_CHECKIN_KEY = "echo-last-checkin-date";

function getChinaDateIsoFrom(date: Date): string {
  const shanghaiDate = formatISODateInShanghai(date);
  return shanghaiDate || getTodayInShanghai();
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getStringField(source: Record<string, unknown>, key: string): string | null {
  const raw = source[key];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

type PageId = NavId | "upload" | "test-list" | "test-taking" | "test-results" | "mental-state-assessment" | "color-perception-test" | "color-test-results" | "visual-analysis" | "calendar";

function UserApp() {
  const [activeNav, setActiveNav] = useState<NavId>("home");
  const [activePage, setActivePage] = useState<PageId>("home");
  // 初始化时先从缓存加载，避免闪烁
  const [userArtworks, setUserArtworks] = useState<Artwork[]>(() => {
    // 如果处于强制退出登录状态，不加载缓存
    if (typeof window !== "undefined") {
      try {
        const forcedLogout = sessionStorage.getItem("echo-forced-logout");
        if (forcedLogout === "true") {
          return [];
        }
      } catch {
        // ignore
      }
    }
    // 不再从本地存储加载，直接返回空数组，等待从服务器获取
    // 这样可以确保数据一致性，避免显示过期的本地数据
    return [];
  });
  const [forcedLogoutVersion, setForcedLogoutVersion] = useState(0);
  const [forcedLogoutVisible, setForcedLogoutVisible] = useState(false);
  const [isForcedLogout, setIsForcedLogout] = useState(false);
  const [colorTestResultData, setColorTestResultData] = useState<{
    selectedOptionId: string;
    mainImageUrl: string;
    options: Array<{
      id: string;
      imageUrl: string;
      percentage: number;
    }>;
  } | null>(null);
  const [currentTestId, setCurrentTestId] = useState<number | null>(null);
  const [currentTestResultId, setCurrentTestResultId] = useState<number | null>(null);
  const [uploadAnimationOrigin, setUploadAnimationOrigin] = useState<{ x: number; y: number; size: number } | null>(null);
  const [isMember, setIsMember] = useState<boolean>(true);
  
  // 滚动位置存储
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const currentPageKeyRef = useRef<string>("");
  // 防止重复上传
  const isUploadingRef = useRef<boolean>(false);
  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const combinedArtworks = useMemo(
    () => {
      const combined = [...userArtworks, ...INITIAL_ARTWORKS];
      return combined;
    },
    [userArtworks],
  );

  const formatArtworkDate = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}年${month}月${day}日`;
  }, []);

  const formatDuration = useCallback((minutesTotal: number) => {
    const hours = Math.floor(minutesTotal / 60);
    const minutes = minutesTotal % 60;
    if (hours === 0) {
      return `${minutes} 分钟`;
    }
    if (minutes === 0) {
      return `${hours} 小时`;
    }
    return `${hours} 小时 ${minutes} 分钟`;
  }, []);

  const mapUploadRecordToArtwork = useCallback(
    (record: UserUploadRecord, fallbackImage?: string | null): Artwork => {
      const uploadedAt = record.uploaded_at || new Date().toISOString();
      const uploadedDate = new Date(uploadedAt);
      const durationMinutes = record.duration_minutes ?? 0;
      const ratingLabel =
        typeof record.self_rating === "number"
          ? String(Math.round(record.self_rating))
          : "";
      // 后端返回的tags是tag ID列表（数字数组）
      // 保存为ID，显示时转换为名称
      const tags = Array.isArray(record.tags) 
        ? record.tags.map(tag => {
            // 确保是数字ID
            const tagId = typeof tag === 'number' ? tag : Number(tag);
            return Number.isFinite(tagId) && tagId > 0 ? String(tagId) : null;
          }).filter((tag): tag is string => tag !== null)
        : [];
      
      // 处理完整图片URL
      let imageSrc = record.image || fallbackImage || "";
      // 如果是相对路径 /api/uploads/...，说明后端返回的是代理URL，需要拼接API base
      if (imageSrc && imageSrc.startsWith("/api/") && !imageSrc.startsWith("http")) {
        const apiBase = API_BASE_URL.replace(/\/api\/?$/, "");
        imageSrc = apiBase ? `${apiBase}${imageSrc}` : imageSrc;
      }
      // 如果URL包含127.0.0.1或localhost，且当前页面不是localhost，则替换为当前hostname
      if (imageSrc && typeof window !== "undefined" && window.location?.hostname) {
        imageSrc = replaceLocalhostInUrl(imageSrc);
      }
      
      // 处理缩略图URL（如果有）
      let thumbnailSrc: string | null = null;
      if ("thumbnail" in record && record.thumbnail) {
        thumbnailSrc = record.thumbnail as string;
        // 同样的URL处理逻辑
        if (thumbnailSrc && thumbnailSrc.startsWith("/api/") && !thumbnailSrc.startsWith("http")) {
          const apiBase = API_BASE_URL.replace(/\/api\/?$/, "");
          thumbnailSrc = apiBase ? `${apiBase}${thumbnailSrc}` : thumbnailSrc;
        }
        if (thumbnailSrc && typeof window !== "undefined" && window.location?.hostname) {
          thumbnailSrc = replaceLocalhostInUrl(thumbnailSrc);
        }
      }
      
      const title = record.title?.trim() || "";
      const description = record.description?.trim() || "";

      return {
        id: `art-${record.id}`,
        title,
        date: formatArtworkDate(uploadedDate),
        tags,
        imageSrc,
        thumbnailSrc: thumbnailSrc || null, // 如果没有缩略图，使用null（前端会回退到完整图）
        alt: `${title} 作品预览`,
        description,
        duration: formatDuration(durationMinutes),
        mood: record.mood_label || "",
        rating: ratingLabel,
        uploadedAt,
        uploadedDate: formatDateKey(uploadedDate),
        durationMinutes: record.duration_minutes ?? null,
      };
    },
    [formatArtworkDate, formatDuration],
  );

  // 使用ref跟踪正在进行的请求，避免重复请求
  const isRefreshingRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 使用ref存储最新的mapUploadRecordToArtwork函数，避免依赖变化导致无限循环
  const mapUploadRecordToArtworkRef = useRef(mapUploadRecordToArtwork);
  
  // 保持ref与最新函数同步
  useEffect(() => {
    mapUploadRecordToArtworkRef.current = mapUploadRecordToArtwork;
  }, [mapUploadRecordToArtwork]);
  
  const refreshUserArtworks = useCallback(async (forceRefresh = false) => {
    // 如果处于强制退出登录状态，不加载任何数据
    if (isForcedLogout) {
      setUserArtworks([]);
      return;
    }
    
    // 如果已经有正在进行的请求，且不是强制刷新，则跳过
    if (isRefreshingRef.current && !forceRefresh) {
      return;
    }
    
    // 防抖：如果短时间内多次调用，只执行最后一次（增加防抖时间到1000ms）
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    
    const executeRefresh = async () => {
      // 再次检查是否有其他请求正在进行（双重检查）
      if (isRefreshingRef.current && !forceRefresh) {
        return;
      }
      
      isRefreshingRef.current = true;
      try {
        // 如果不是强制刷新，先尝试使用缓存
        // fetchUserUploads(useCache, forceRefresh)
        const records = await fetchUserUploads(!forceRefresh, forceRefresh);
        
        // 过滤掉灵感记录（带 __INSPIRATION_NOTE__ 标记的记录）
        const INSPIRATION_MARKER = "__INSPIRATION_NOTE__";
        const artworkRecords = records.filter((record) => {
          // 排除包含灵感标记的记录
          return !(record.description && record.description.includes(INSPIRATION_MARKER));
        });
        
        const mapped = artworkRecords.map((item) => mapUploadRecordToArtworkRef.current(item));
        
        // 直接使用服务器返回的数据，不保留任何本地套图信息
        const merged = mapped;
        
        // 服务器数据优先：直接使用服务器返回的数据，不保留本地状态
        // 这样可以确保不同设备之间的数据一致性
        setUserArtworks((prev) => {
          // 如果数据没有变化，不更新状态，避免不必要的重新渲染
          if (prev.length === merged.length && 
              prev.every((item, index) => {
                const mergedItem = merged[index];
                return mergedItem && item.id === mergedItem.id && 
                       JSON.stringify(item) === JSON.stringify(mergedItem);
              })) {
            return prev;
          }
          
          // 只使用服务器返回的数据，确保数据一致性
          // 本地存储只作为缓存，不覆盖服务器数据
          // silent=true 避免触发 USER_ARTWORKS_CHANGED_EVENT，防止循环调用
          persistStoredArtworks(merged, true);
          return merged;
        });
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status !== 401 && status !== 403) {
          // 不再回退到本地存储，确保数据一致性
          // 如果服务器请求失败，保持空数组，等待下次刷新或用户手动刷新
          setUserArtworks([]);
        } else {
          // 认证错误时，清空数据
          setUserArtworks([]);
        }
      } finally {
        isRefreshingRef.current = false;
        refreshTimeoutRef.current = null;
      }
    };
    
    if (forceRefresh) {
      // 强制刷新立即执行
      executeRefresh();
    } else {
      // 非强制刷新使用防抖（1000ms）
      refreshTimeoutRef.current = setTimeout(executeRefresh, 1000);
    }
  }, [isForcedLogout]); // 移除 mapUploadRecordToArtwork 依赖，使用 ref 存储的最新值


  // 使用ref存储refreshUserArtworks函数，避免事件监听器依赖变化导致重新注册
  const refreshUserArtworksRef = useRef(refreshUserArtworks);
  useEffect(() => {
    refreshUserArtworksRef.current = refreshUserArtworks;
  }, [refreshUserArtworks]);

  // 使用useRef存储isForcedLogout状态，避免竞态条件
  const isForcedLogoutRef = useRef(isForcedLogout);
  useEffect(() => {
    isForcedLogoutRef.current = isForcedLogout;
  }, [isForcedLogout]);

  // 使用ref标记是否已经初始化，避免React.StrictMode双重执行导致重复请求
  const hasInitializedRef = useRef(false);
  
  useEffect(() => {
    // 如果已经初始化过，跳过（React.StrictMode会导致useEffect执行两次）
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    
    // 如果处于强制退出登录状态，不加载任何数据
    if (isForcedLogoutRef.current) {
      setUserArtworks([]);
      return;
    }
    
    if (!hasAuthToken()) {
      // 没有认证token时，不加载任何数据，确保数据安全
      setUserArtworks([]);
      return;
    }

    // 使用函数引用，但只在组件挂载时执行一次
    refreshUserArtworks().catch(() => {
      /* 已在函数内部处理 */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次，刷新函数是稳定的（使用 useCallback）


  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // 事件防抖：避免短时间内多次触发导致频繁请求
    let eventTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== USER_ARTWORK_STORAGE_KEY) {
        return;
      }
      // 防抖：如果短时间内多次触发，只执行最后一次
      if (eventTimeout) {
        clearTimeout(eventTimeout);
      }
      eventTimeout = setTimeout(() => {
        refreshUserArtworksRef.current().catch(() => {
          /* 已在函数内部处理 */
        });
        eventTimeout = null;
      }, 300);
    };

    const handleArtworksChanged = (_event: Event) => {
      // 如果正在刷新，跳过事件处理，避免循环触发
      if (isRefreshingRef.current) {
        return;
      }
      // 检查事件是否是我们自己触发的（通过 detail 标记）
      const customEvent = _event as CustomEvent;
      if (customEvent?.detail?.skipRefresh) {
        // 如果是标记为跳过刷新的事件，只更新UI，不触发新的请求
        return;
      }
      // 防抖：如果短时间内多次触发，只执行最后一次（增加防抖时间到1000ms）
      if (eventTimeout) {
        clearTimeout(eventTimeout);
      }
      eventTimeout = setTimeout(() => {
        // 再次检查是否正在刷新，避免在防抖期间又有新的刷新请求
        if (isRefreshingRef.current) {
          eventTimeout = null;
          return;
        }
        refreshUserArtworksRef.current().catch(() => {
          /* 已在函数内部处理 */
        });
        eventTimeout = null;
      }, 1000); // 增加防抖时间到1秒，避免频繁请求
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    return () => {
      if (eventTimeout) {
        clearTimeout(eventTimeout);
      }
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    };
  }, []); // 只在组件挂载时注册一次事件监听器，使用 ref 访问最新的函数

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleForcedLogout = (event: Event) => {
      // 标记为强制退出登录，防止重新加载数据
      setIsForcedLogout(true);
      
      // 清除所有用户相关的状态
      setUserArtworks([]);
      persistStoredArtworks([]);
      
      // 清除所有用户相关的缓存
      if (typeof window !== "undefined") {
        // 使用动态导入避免循环依赖，但需要同步执行
        import("@/utils/clearUserCache").then(({ clearAllUserCache }) => {
          clearAllUserCache();
        }).catch(() => {
          // ignore cache clear errors
        });
      }
      
      setForcedLogoutVersion((prev) => prev + 1);
      setActiveNav("profile");
      setActivePage("profile");
      setForcedLogoutVisible(true);

      // Forced logout handled
    };

    window.addEventListener(AUTH_FORCED_LOGOUT_EVENT, handleForcedLogout);
    return () => {
      window.removeEventListener(AUTH_FORCED_LOGOUT_EVENT, handleForcedLogout);
    };
  }, []);

  // 监听登录态变化：当 token 写入/清除时，刷新用户数据，保证图片 URL（含 token）与权限数据最新
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleAuthChanged = () => {
      // 如果用户重新登录，重置强制退出登录标志
      if (hasAuthToken() && isForcedLogout) {
        setIsForcedLogout(false);
      }
      refreshUserArtworks().catch(() => {
        /* 已在函数内部处理 */
      });
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    };
  }, [refreshUserArtworks, isForcedLogout]);

  // 监听导航到会员购买页面的事件
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const handleNavigateToMembership = () => {
      // 使用 sessionStorage 标记需要打开会员选项
      sessionStorage.setItem("open-membership-options", "true");
      setActiveNav("profile");
      setActivePage("profile");
    };
    
    window.addEventListener("navigate-to-membership", handleNavigateToMembership);
    return () => {
      window.removeEventListener("navigate-to-membership", handleNavigateToMembership);
    };
  }, []);

  // 监听注册成功后跳转到首页的事件
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const handleNavigateToHome = () => {
      setActiveNav("home");
      setActivePage("home");
    };
    
    window.addEventListener("echodraw-navigate-to-home", handleNavigateToHome);
    return () => {
      window.removeEventListener("echodraw-navigate-to-home", handleNavigateToHome);
    };
  }, []);

  // 监听跳转到我的页面的事件
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const handleNavigateToProfile = () => {
      setActiveNav("profile");
      setActivePage("profile");
    };
    
    window.addEventListener("navigate-to-profile", handleNavigateToProfile);
    return () => {
      window.removeEventListener("navigate-to-profile", handleNavigateToProfile);
    };
  }, []);

  // 处理微信授权回调：如果URL中有code和state，自动跳转到Profile页面处理
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    
    // 如果URL中有code和state，说明是微信授权回调
    // 需要跳转到Profile页面，让Profile组件的useEffect处理授权回调
    if (code && state && activeNav !== "profile") {
      console.log("[Echo] 检测到微信授权回调，自动跳转到Profile页面处理");
      setActiveNav("profile");
      setActivePage("profile");
    }
  }, [activeNav]);

  // 获取用户会员状态
  useEffect(() => {
    const loadMembershipStatus = async () => {
      if (!hasAuthToken()) {
        setIsMember(true); // 未登录时默认设为会员，避免阻止使用
        return;
      }
      try {
        const preferences = await fetchProfilePreferences();
        setIsMember(preferences.isMember);
      } catch (err) {
        console.error("获取用户会员状态失败:", err);
        // 默认设为会员，避免阻止用户使用
        setIsMember(true);
      }
    };
    loadMembershipStatus();
  }, []);

  const handleOpenUpload = useCallback((origin?: { x: number; y: number; size: number }) => {
    if (origin) {
      setUploadAnimationOrigin(origin);
    }
    setActivePage("upload");
  }, []);

  const handleCloseUpload = useCallback(() => {
    setActivePage((prev) => (prev === "upload" ? activeNav : prev));
    // 延迟清除动画原点，等待动画完成
    setTimeout(() => {
      setUploadAnimationOrigin(null);
    }, 400);
  }, [activeNav]);


  const handleOpenTestList = useCallback(() => {
    setActivePage("test-list");
  }, []);

  const handleCloseTestList = useCallback(() => {
    setActivePage(activeNav);
  }, [activeNav]);

  const handleSelectTest = useCallback((testId: number) => {
    setCurrentTestId(testId);
    setActivePage("test-taking");
  }, []);

  const handleTestComplete = useCallback((resultId: number) => {
    setCurrentTestResultId(resultId);
    setCurrentTestId(null);
    setActivePage("test-results");
  }, []);

  const handleCloseTestTaking = useCallback(() => {
    setCurrentTestId(null);
    setActivePage("test-list");
  }, []);

  const handleCloseTestResults = useCallback(() => {
    setCurrentTestResultId(null);
    // 如果是从报告页面打开的，返回报告页面；否则返回测试列表
    if (activeNav === "reports") {
      setActivePage("reports");
    } else {
      setActivePage("test-list");
    }
  }, [activeNav]);

  const handleOpenTestResult = useCallback((resultId: number) => {
    setCurrentTestResultId(resultId);
    setActivePage("test-results");
  }, []);

  const [currentVisualAnalysisResultId, setCurrentVisualAnalysisResultId] = useState<number | null>(null);

  const handleOpenVisualAnalysisResult = useCallback((resultId: number) => {
    setCurrentVisualAnalysisResultId(resultId);
    setActivePage("visual-analysis");
  }, []);

  const handleCloseVisualAnalysis = useCallback(() => {
    setCurrentVisualAnalysisResultId(null);
    setActivePage(activeNav);
  }, [activeNav]);

  const handleCloseMentalStateAssessment = useCallback(() => {
    setActivePage("test-list");
  }, []);


  const handleOpenColorPerceptionTest = useCallback(() => {
    setActivePage("color-perception-test");
  }, []);

  const handleCloseColorPerceptionTest = useCallback(() => {
    setActivePage(activeNav);
  }, [activeNav]);

  const handleOpenCalendar = useCallback(() => {
    setActivePage("calendar");
  }, []);

  const handleCloseCalendar = useCallback(() => {
    setActivePage(activeNav);
  }, [activeNav]);

  const handleOpenVisualAnalysis = useCallback(() => {
    setActivePage("visual-analysis");
  }, []);


  const handleVisualAnalysisSave = useCallback(async (result: any) => {
    try {
      const { createVisualAnalysisResult } = await import("@/services/api");
      await createVisualAnalysisResult({
        original_image: result.originalImage,
        step1_binary: result.step1Binary,
        step2_grayscale: result.step2Grayscale,
        step3_lab_l: result.step3LabL,
        step4_hsv_s: result.step4HsvS,
        step4_hls_s: result.step4HlsS,
        step5_hue: result.step5Hue,
        binary_threshold: result.binaryThreshold,
        comprehensive_analysis: result.comprehensive_analysis || null, // 包含专业分析结果
      });
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("视觉分析结果已保存到报告");
      }
    } catch {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("保存失败，请稍后重试");
      }
    }
  }, []);

  const handleColorTestComplete = useCallback(
    (result: {
      selectedOptionId: string;
      mainImageUrl: string;
      options: Array<{
        id: string;
        imageUrl: string;
        percentage: number;
      }>;
    }) => {
      setColorTestResultData(result);
      setActivePage("color-test-results");
    },
    [],
  );

  const handleCloseColorTestResults = useCallback(() => {
    setActivePage(activeNav);
    setColorTestResultData(null);
  }, [activeNav]);

  const handleColorTestNext = useCallback(() => {
    // 下一题逻辑：返回测试页面
    setActivePage("color-perception-test");
    setColorTestResultData(null);
  }, []);


  // 获取当前页面的唯一标识
  const getCurrentPageKey = useCallback(() => {
    // 对于详情页等特殊页面，使用activePage
    if (activePage !== activeNav && activePage !== "home") {
      return activePage;
    }
    // 对于主要导航页面，使用activeNav
    return activeNav;
  }, [activeNav, activePage]);

  // 保存当前页面的滚动位置
  const saveScrollPosition = useCallback((pageKey: string) => {
    if (typeof window === "undefined") {
      return;
    }
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
    scrollPositionsRef.current.set(pageKey, scrollY);
  }, []);

  // 恢复页面的滚动位置
  const restoreScrollPosition = useCallback((pageKey: string) => {
    if (typeof window === "undefined") {
      return;
    }
    const savedPosition = scrollPositionsRef.current.get(pageKey);
    if (savedPosition !== undefined) {
      // 使用requestAnimationFrame确保DOM已更新
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
      });
    } else {
      // 如果没有保存的位置，滚动到顶部
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    }
  }, []);

  // 监听页面切换，保存和恢复滚动位置
  useEffect(() => {
    const previousPageKey = currentPageKeyRef.current;
    const currentPageKey = getCurrentPageKey();

    // 如果页面切换了
    if (previousPageKey !== currentPageKey) {
      // 保存上一个页面的滚动位置（同步执行，避免丢失）
      if (previousPageKey) {
        saveScrollPosition(previousPageKey);
      }
      
      // 使用 startTransition 包装滚动恢复，避免阻塞渲染
      // 滚动恢复不是关键操作，可以延迟执行
      // restoreScrollPosition 内部已经使用了 requestAnimationFrame，这里不需要再包装
      startTransition(() => {
        restoreScrollPosition(currentPageKey);
      });
      
      // 更新当前页面标识
      currentPageKeyRef.current = currentPageKey;
    }
  }, [activeNav, activePage, getCurrentPageKey, saveScrollPosition, restoreScrollPosition]);

  // 组件卸载时保存当前页面的滚动位置
  useEffect(() => {
    return () => {
      const currentPageKey = getCurrentPageKey();
      if (currentPageKey) {
        saveScrollPosition(currentPageKey);
      }
    };
  }, [getCurrentPageKey, saveScrollPosition]);


  const handleUploadSave = useCallback(
    async (result: UploadResult) => {
      // 防止重复提交
      if (isUploadingRef.current) {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert("上传正在进行中，请稍候...");
        }
        return;
      }
      isUploadingRef.current = true;
      
      // 设置超时机制（30秒），防止永久阻塞
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
      uploadTimeoutRef.current = setTimeout(() => {
        if (isUploadingRef.current) {
          isUploadingRef.current = false;
          if (typeof window !== "undefined" && typeof window.alert === "function") {
            window.alert("上传超时，请重试。");
          }
        }
      }, 30000);

      // 移除本地保存逻辑：所有作品必须上传到服务器
      // 如果上传失败，应该重试而不是只保存在本地
      // 这样可以确保不同设备之间的数据一致性

      try {
        // 检查每月上传限制
        const limitInfo = await checkUploadLimit();
        if (!limitInfo.can_upload) {
          window.alert(
            `本月已上传 ${limitInfo.monthly_count} 张图片，已达到每月上限 ${limitInfo.max_monthly_uploads} 张。\n\n删除已上传的图片后可以继续上传。`
          );
          isUploadingRef.current = false;
          if (uploadTimeoutRef.current) {
            clearTimeout(uploadTimeoutRef.current);
            uploadTimeoutRef.current = null;
          }
          return;
        }
        
        // result.tags现在应该都是数字ID（因为buildTagOptionsAsync已修复）
        // 但为了兼容，仍然进行转换处理
        const tagIds = result.tags.map(tag => {
          if (typeof tag === 'number') {
            return tag;
          }
          // 尝试将字符串转换为数字
          const num = Number(tag);
          if (Number.isFinite(num) && num > 0) {
            return num;
          }
          // 如果无法转换，可能是旧的字符串ID格式，返回原值让API处理
          return tag;
        });
        
        const record = await createUserUpload({
          file: result.file,
          title: result.title,
          description: result.description,
          tags: tagIds,
          moodId: result.moodId,
          selfRating: result.rating,
          durationMinutes: result.durationMinutes,
        });
        const artwork = mapUploadRecordToArtwork(record, result.previewDataUrl);
        // 优先使用上传时传递的 tags，因为后端可能返回的格式不对
        if (result.tags && result.tags.length > 0) {
          artwork.tags = result.tags.map(tag => String(tag));
        }
        // 套图相关字段：优先使用后端返回的数据（snake_case），如果不存在则使用上传时的数据
        artwork.collectionId = (record as any).collection_id ?? (record as any).collectionId ?? result.collectionId ?? null;
        artwork.collectionName = (record as any).collection_name ?? (record as any).collectionName ?? result.collectionName ?? null;
        artwork.collectionIndex = (record as any).collection_index ?? (record as any).collectionIndex ?? result.collectionIndex ?? null;
        artwork.incrementalDurationMinutes = result.incrementalDurationMinutes ?? (record as any).incrementalDurationMinutes ?? null;
        
        // 使用函数式更新，确保状态一致性
        setUserArtworks((prev) => {
          // 过滤掉可能存在的相同ID的作品（避免重复）
          const filtered = prev.filter((item) => item.id !== artwork.id);
          const next = [artwork, ...filtered];
        // 立即持久化，确保本地存储与状态同步
        // 即使后端不支持套图字段，本地存储也会保存这些信息
        // silent=true 因为我们下面会从服务器刷新，避免重复触发
        persistStoredArtworks(next, true);
          return next;
        });
        
        try {
          const chinaIso = getChinaDateIsoFrom(new Date(record.uploaded_at));
          if (typeof window !== "undefined") {
            window.localStorage.setItem(LOCAL_LAST_CHECKIN_KEY, chinaIso);
            // 触发打卡状态刷新事件，让首页更新打卡状态
            window.dispatchEvent(new CustomEvent(CHECK_IN_STATUS_CHANGED_EVENT));
          }
        } catch {
          // ignore storage errors
        }
        
        // 立即刷新，确保后端数据已同步
        // 清除缓存，强制从服务器获取最新数据
        // 注意：这里只刷新一次，不再触发事件，避免重复请求
        clearCache("/uploads/");
        await refreshUserArtworks(true).catch(() => {
          // ignore refresh errors
        });
        
        // 刷新完成后，触发事件通知其他组件（但不触发新的刷新请求）
        // 使用 detail.skipRefresh 标记，告诉监听器不要再次触发刷新
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(USER_ARTWORKS_CHANGED_EVENT, {
            detail: { skipRefresh: true }
          }));
        }
        
        // 使用startTransition确保不在渲染过程中更新状态
        startTransition(() => {
          setActivePage(activeNav);
        });
        
        isUploadingRef.current = false;
        if (uploadTimeoutRef.current) {
          clearTimeout(uploadTimeoutRef.current);
          uploadTimeoutRef.current = null;
        }
      } catch (error) {
        const axiosError = error as { 
          response?: { 
            status?: number;
            data?: {
              detail?: string;
              message?: string;
              error?: string;
              [key: string]: unknown;
            };
          };
        };
        const status = axiosError?.response?.status;
        const errorData = axiosError?.response?.data;
        
        if (status === 401 || status === 403) {
          setForcedLogoutVisible(true);
          isUploadingRef.current = false;
          if (uploadTimeoutRef.current) {
            clearTimeout(uploadTimeoutRef.current);
            uploadTimeoutRef.current = null;
          }
          return;
        }
        
        // 提取详细的错误信息
        let errorMessage = "上传失败，请稍后重试。";
        if (status === 429) {
          // 429错误：请求被限流
          let waitTime = "";
          if (errorData) {
            const detail = errorData.detail || errorData.message || errorData.error;
            if (typeof detail === "string") {
              // 尝试从错误信息中提取等待时间（秒）
              const match = detail.match(/(\d+)\s*秒/);
              if (match) {
                const seconds = parseInt(match[1], 10);
                if (seconds >= 60) {
                  const minutes = Math.floor(seconds / 60);
                  const remainingSeconds = seconds % 60;
                  if (remainingSeconds > 0) {
                    waitTime = `约 ${minutes} 分 ${remainingSeconds} 秒`;
                  } else {
                    waitTime = `约 ${minutes} 分钟`;
                  }
                } else {
                  waitTime = `约 ${seconds} 秒`;
                }
              }
            }
          }
          if (waitTime) {
            errorMessage = `上传请求过于频繁，请等待 ${waitTime} 后再试。`;
          } else {
            errorMessage = "上传请求过于频繁，请稍后再试。";
          }
        } else if (errorData) {
          // 尝试提取错误详情
          if (typeof errorData.detail === "string") {
            errorMessage = `上传失败：${errorData.detail}`;
          } else if (typeof errorData.message === "string") {
            errorMessage = `上传失败：${errorData.message}`;
          } else if (typeof errorData.error === "string") {
            errorMessage = `上传失败：${errorData.error}`;
          } else if (status === 400) {
            // 400错误通常是验证失败，尝试提取字段级错误
            const fieldErrors: string[] = [];
            for (const [key, value] of Object.entries(errorData)) {
              if (Array.isArray(value) && value.length > 0) {
                fieldErrors.push(`${key}: ${value[0]}`);
              } else if (typeof value === "string") {
                fieldErrors.push(`${key}: ${value}`);
              }
            }
            if (fieldErrors.length > 0) {
              errorMessage = `上传失败：${fieldErrors.join("；")}`;
            } else {
              errorMessage = "上传失败：请检查输入的数据格式是否正确。";
            }
          }
        } else if (status === 500) {
          errorMessage = "服务器错误，请稍后重试。";
        } else if (status === 413) {
          errorMessage = "文件过大，请选择较小的图片。";
        } else if (status === 0 || !status) {
          // 网络错误或请求被取消
          errorMessage = "上传失败：网络连接失败，请检查网络后重试。";
        }
        
        // 显示错误提示给用户
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert(errorMessage);
        }
        
        // 上传失败时不保存到本地，确保数据一致性
        // 用户需要重试上传，直到成功上传到服务器
        isUploadingRef.current = false;
        if (uploadTimeoutRef.current) {
          clearTimeout(uploadTimeoutRef.current);
          uploadTimeoutRef.current = null;
        }
      }
    },
    [activeNav, formatArtworkDate, formatDuration, mapUploadRecordToArtwork, refreshUserArtworks],
  );
  
  // 页面卸载时清理上传状态
  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
      isUploadingRef.current = false;
    };
  }, []);

  const handleDeleteArtwork = useCallback(
    async (target: Artwork) => {
      if (!isUserArtwork(target)) {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert("预设作品暂不支持删除。");
        }
        return;
      }

      const rawId = target.id.replace(/^art-/, "");
      const uploadId = Number.parseInt(rawId, 10);
      
      // 验证ID是否有效
      if (Number.isNaN(uploadId) || uploadId <= 0) {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert("无效的作品ID，无法删除。");
        }
        return;
      }

      let shouldRemove = true;

      try {
        await deleteUserUpload(uploadId);
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        
        // 404表示作品已不存在，可以继续删除本地数据
        // 401/403表示未授权，不应该删除本地数据
        // 其他错误（如网络错误、500等）也不应该删除本地数据
        if (status === 401 || status === 403) {
          shouldRemove = false;
          if (typeof window !== "undefined" && typeof window.alert === "function") {
            window.alert("您没有权限删除此作品。");
          }
        } else if (status !== 404) {
          // 非404错误（网络错误、500等）不应该删除本地数据
          shouldRemove = false;
          if (typeof window !== "undefined" && typeof window.alert === "function") {
            window.alert("删除失败，请稍后重试。");
          }
        }
        // 如果是404，说明服务器上已不存在，可以继续删除本地数据
      }

      if (!shouldRemove) {
        throw new Error("删除失败");
      }

      // 从featured artworks中移除（如果存在）
      await removeFeaturedArtworkId(target.id);

      // 清除API缓存，强制从服务器获取最新数据
      clearCache("/uploads/");
      
      // 立即从状态中移除，确保UI立即更新（乐观更新）
      setUserArtworks((prev) => {
        const next = prev.filter((item) => item.id !== target.id);
        // 更新本地存储，但这是临时状态，会被服务器数据覆盖
        // silent=true 因为后面会调用 refreshUserArtworks，避免循环触发
        persistStoredArtworks(next, true);
        return next;
      });
      
      // 从服务器刷新数据，确保删除已同步到服务器
      // 这样可以确保不同设备之间的数据一致性
      await refreshUserArtworks(true).catch(() => {
        // 如果刷新失败，状态已经更新（乐观更新）
        // 下次刷新时会从服务器获取最新数据
      });
      
      // 刷新完成后，触发事件通知其他组件（但不触发新的刷新请求）
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(USER_ARTWORKS_CHANGED_EVENT, {
          detail: { skipRefresh: true }
        }));
      }
    },
    [],
  );

  const handleEditArtwork = useCallback((target: Artwork) => {
    // 编辑功能现在由 GalleryDetailModal 处理，这里不需要做任何事
  }, []);

  const handleUpdateArtwork = useCallback(
    async (updatedArtwork: Artwork) => {
      if (!isUserArtwork(updatedArtwork)) {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert("预设作品暂不支持编辑。");
        }
        return;
      }

      const rawId = updatedArtwork.id.replace(/^art-/, "");
      const uploadId = Number.parseInt(rawId, 10);
      
      // 验证ID是否有效
      if (Number.isNaN(uploadId) || uploadId <= 0) {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert("无效的作品ID，无法更新。");
        }
        return;
      }

      try {
        // 将 mood 字符串转换为 mood ID
        let moodId: number | null = null;
        if (updatedArtwork.mood && updatedArtwork.mood.trim()) {
          try {
            const moods = await fetchMoods();
            const matchedMood = moods.find((m) => m.name === updatedArtwork.mood);
            if (matchedMood) {
              moodId = matchedMood.id;
            }
          } catch {
            // ignore mood fetch errors
          }
        }

        // 将标签转换为数字ID
        const tagIds: number[] = updatedArtwork.tags
          .map((tag) => {
            const num = typeof tag === "string" ? Number.parseInt(tag, 10) : tag;
            return Number.isFinite(num) && num > 0 ? num : null;
          })
          .filter((id): id is number => id !== null);

        // 将 rating 字符串转换为数字
        const selfRating = updatedArtwork.rating
          ? Number.parseFloat(updatedArtwork.rating)
          : 0;

        // 调用更新API
        await updateUserUpload(uploadId, {
          title: updatedArtwork.title,
          description: updatedArtwork.description,
          tags: tagIds,
          moodId,
          selfRating: Number.isFinite(selfRating) ? selfRating : 0,
          durationMinutes: updatedArtwork.durationMinutes ?? 0,
          collectionId: updatedArtwork.collectionId ?? null,
          collectionName: updatedArtwork.collectionName ?? null,
          collectionIndex: updatedArtwork.collectionIndex ?? null,
        });

        // 更新本地状态（乐观更新）
        setUserArtworks((prev) => {
          const next = prev.map((item) => (item.id === updatedArtwork.id ? updatedArtwork : item));
          // 更新本地存储
          persistStoredArtworks(next, true);
          return next;
        });

        // 清除API缓存，强制从服务器获取最新数据
        clearCache("/uploads/");

        // 从服务器刷新数据，确保更新已同步到服务器
        await refreshUserArtworks(true).catch(() => {
          // ignore refresh errors
        });
        
        // 刷新完成后，触发事件通知其他组件（但不触发新的刷新请求）
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(USER_ARTWORKS_CHANGED_EVENT, {
            detail: { skipRefresh: true }
          }));
        }
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        
        if (status === 401 || status === 403) {
          if (typeof window !== "undefined" && typeof window.alert === "function") {
            window.alert("您没有权限更新此作品。");
          }
        } else {
          if (typeof window !== "undefined" && typeof window.alert === "function") {
            window.alert("更新失败，请稍后重试。");
          }
        }
        throw error;
      }
    },
    [],
  );

  const handleSetAsFeatured = useCallback(async (target: Artwork) => {
    await addFeaturedArtworkId(target.id);
  }, []);

  const handleRemoveFromFeatured = useCallback(async (target: Artwork) => {
    await removeFeaturedArtworkId(target.id);
  }, []);




  return (
    <div className="app-shell">
      <Suspense fallback={<PageLoadingFallback />}>
        {activePage === "upload" ? (
          <CircularRevealWrapper
            key={`upload-${uploadAnimationOrigin?.x}-${uploadAnimationOrigin?.y}`}
            open={activePage === "upload"}
            onClose={handleCloseUpload}
            originX={uploadAnimationOrigin?.x}
            originY={uploadAnimationOrigin?.y}
            originSize={uploadAnimationOrigin?.size}
          >
            <Upload 
              onClose={handleCloseUpload} 
              onSave={handleUploadSave}
              userArtworks={userArtworks}
              isMember={isMember}
              onJoinMembership={() => {
                handleCloseUpload();
                // 使用 sessionStorage 标记需要打开会员选项
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("open-membership-options", "true");
                }
                setActiveNav("profile");
                setActivePage("profile");
              }}
            />
          </CircularRevealWrapper>
        ) : activePage === "test-list" ? (
          <TestList
            onBack={handleCloseTestList}
            onSelectTest={handleSelectTest}
            onOpenColorPerceptionTest={handleOpenColorPerceptionTest}
          />
        ) : activePage === "test-taking" && currentTestId !== null ? (
          <TestTaking
            testId={currentTestId}
            onBack={handleCloseTestTaking}
            onComplete={handleTestComplete}
          />
        ) : activePage === "test-results" && currentTestResultId !== null ? (
          <TestResults
            resultId={currentTestResultId}
            onBack={handleCloseTestResults}
          />
        ) : activePage === "mental-state-assessment" ? (
          <MentalStateAssessment onBack={handleCloseMentalStateAssessment} />
        ) : activePage === "color-perception-test" ? (
          <ColorPerceptionTest onBack={handleCloseColorPerceptionTest} onComplete={handleColorTestComplete} />
        ) : activePage === "color-test-results" ? (
          <ColorTestResults
            onBack={handleCloseColorTestResults}
            onNext={handleColorTestNext}
            testData={colorTestResultData || undefined}
          />
        ) : activePage === "calendar" ? (
          <Calendar
            onBack={handleCloseCalendar}
            onOpenUpload={() => {
              handleOpenUpload();
            }}
          />
        ) : activePage === "visual-analysis" ? (
          <VisualAnalysis
            onBack={handleCloseVisualAnalysis}
            onSave={handleVisualAnalysisSave}
            resultId={currentVisualAnalysisResultId ?? undefined}
            onNavigateToProfile={() => {
              handleCloseVisualAnalysis();
              setActiveNav("profile");
              setActivePage("profile");
            }}
          />
        ) : activeNav === "home" ? (
          <Home
            onOpenUpload={handleOpenUpload}
            onOpenMentalStateAssessment={handleOpenTestList}
            onOpenColorPerceptionTest={handleOpenColorPerceptionTest}
            onOpenVisualAnalysis={handleOpenVisualAnalysis}
            onNavigateToProfile={() => {
              setActiveNav("profile");
              setActivePage("profile");
            }}
          />
        ) : activeNav === "gallery" ? (
          <Gallery
            artworks={combinedArtworks}
            onOpenUpload={handleOpenUpload}
            onDeleteArtwork={handleDeleteArtwork}
            onEditArtwork={handleEditArtwork}
            onUpdateArtwork={handleUpdateArtwork}
            onSetAsFeatured={handleSetAsFeatured}
            onRemoveFromFeatured={handleRemoveFromFeatured}
          />
        ) : activeNav === "goals" ? (
          <Goals />
        ) : activeNav === "reports" ? (
          <Reports 
            artworks={userArtworks} 
            onOpenTestResult={handleOpenTestResult}
            onOpenVisualAnalysisResult={handleOpenVisualAnalysisResult}
          />
        ) : (
          <Profile
            forcedLogoutVersion={forcedLogoutVersion}
            artworks={combinedArtworks}
          />
        )}
      </Suspense>
      <BottomNav
        activeId={activeNav}
        onChange={(id) => {
          // 使用 startTransition 包装导航切换，避免阻塞渲染
          // 这样可以让导航栏的视觉反馈立即响应，页面内容在后台加载
          startTransition(() => {
            setActiveNav(id);
            setActivePage(id);
          });
        }}
      />
      {forcedLogoutVisible ? (
        <div className="forced-logout-overlay">
          <div className="forced-logout-dialog">
            <h2>登录状态已失效</h2>
            <p>检测到该账号已在其他设备登录，本设备会自动退出，请重新登录后继续使用。</p>
            <button
              type="button"
              onClick={() => {
                setForcedLogoutVisible(false);
                setActiveNav("profile");
                setActivePage("profile");
              }}
            >
              去登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default UserApp;


