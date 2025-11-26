"""
专业绘画分析系统
基于 OpenCV + scikit-image 实现
"""

import base64
import io
from typing import Dict, List, Tuple, Any
import numpy as np
import cv2
from PIL import Image
from skimage import color
from skimage.morphology import disk
from scipy import ndimage
from scipy.cluster.hierarchy import linkage, fcluster
from PIL import ImageOps


def decode_base64_image(image_data: str, max_side: int = 1536) -> np.ndarray:
    """
    将 base64 编码的图片解码为 numpy 数组
    并进行压缩处理
    
    Args:
        image_data: base64编码的图片数据
        max_side: 最大边长，默认1536（优化性能，减少约44%计算量）
    
    Returns:
        RGB格式的numpy数组
    """
    # 移除 data URL 前缀（如果有）
    if ',' in image_data:
        image_data = image_data.split(',')[1]
    
    image_bytes = base64.b64decode(image_data)
    image = Image.open(io.BytesIO(image_bytes))
    
    # 验证图片格式
    if image.format not in ['JPEG', 'PNG', 'WEBP', 'GIF']:
        raise ValueError(f"不支持的图片格式：{image.format}")
    
    # 验证图片尺寸（防止超大图片导致内存问题）
    width, height = image.size
    max_dimension = 20000  # 最大边长20000像素
    if width > max_dimension or height > max_dimension:
        raise ValueError(f"图片尺寸过大：{width}x{height}。最大支持：{max_dimension}x{max_dimension}像素")
    
    # 纠正 EXIF 方向
    image = ImageOps.exif_transpose(image)
    
    # 检查是否有透明通道
    has_transparency = False
    if image.mode in ('RGBA', 'LA'):
        has_transparency = True
    elif image.mode == 'P':
        has_transparency = image.info.get('transparency') is not None
    
    # 转换为 RGB（与上传压缩逻辑一致）
    if has_transparency:
        if image.mode != 'RGBA':
            image = image.convert("RGBA")
        # RGBA转RGB（白色背景）
        rgb_image = Image.new('RGB', image.size, (255, 255, 255))
        rgb_image.paste(image, mask=image.split()[3] if image.mode == 'RGBA' else None)
        image = rgb_image
    else:
        image = image.convert('RGB')
    
    # 调整尺寸（与上传压缩逻辑一致，使用LANCZOS插值）
    width, height = image.size
    if max(width, height) > max_side:
        if width >= height:
            new_width = max_side
            new_height = int(height * (max_side / width))
        else:
            new_height = max_side
            new_width = int(width * (max_side / height))
        image = image.resize((new_width, new_height), Image.LANCZOS)
    
    return np.array(image)


def encode_image_to_base64(image: np.ndarray, format: str = 'PNG') -> str:
    """将 numpy 数组编码为 base64"""
    # 确保是 uint8 类型
    if image.dtype != np.uint8:
        if image.max() <= 1.0:
            image = (image * 255).astype(np.uint8)
        else:
            image = image.astype(np.uint8)
    
    # 转换为 PIL Image
    if len(image.shape) == 2:
        # 灰度图
        pil_image = Image.fromarray(image, mode='L')
    elif len(image.shape) == 3:
        # RGB 图
        pil_image = Image.fromarray(image, mode='RGB')
    else:
        raise ValueError(f"不支持的图像形状: {image.shape}")
    
    # 转换为 base64
    buffer = io.BytesIO()
    pil_image.save(buffer, format=format)
    image_bytes = buffer.getvalue()
    return base64.b64encode(image_bytes).decode('utf-8')


# ========== ① 明暗结构（Value Structure）==========

def analyze_lab_luminance(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    1. LAB 视觉亮度图
    把 RGB → LAB，取 L 通道并归一化
    """
    lab = color.rgb2lab(rgb_image)
    l_channel = lab[:, :, 0]  # L 通道范围 0-100
    
    # 归一化到 0-255
    l_normalized = (l_channel / 100.0 * 255).astype(np.uint8)
    
    return {
        'l_channel': encode_image_to_base64(l_normalized),
        'l_mean': float(np.mean(l_channel)),
        'l_std': float(np.std(l_channel)),
    }


def analyze_local_contrast(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    2. 局部对比度图（Local Contrast）
    对 L 通道做 CLAHE（对比度限制自适应直方图均衡）
    """
    lab = color.rgb2lab(rgb_image)
    l_channel = lab[:, :, 0]
    
    # 归一化到 0-255
    l_normalized = (l_channel / 100.0 * 255).astype(np.uint8)
    
    # 应用 CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(l_normalized)
    
    # 计算局部方差（使用 scipy.ndimage）
    selem = disk(15)  # 15像素半径的圆盘
    # 使用通用滤波器计算局部方差
    local_mean = ndimage.generic_filter(l_normalized.astype(np.float32), np.mean, footprint=selem)
    local_mean_sq = ndimage.generic_filter((l_normalized.astype(np.float32))**2, np.mean, footprint=selem)
    local_variance = local_mean_sq - local_mean**2
    local_variance = np.clip(local_variance, 0, None)  # 确保非负
    local_variance_normalized = (local_variance / (local_variance.max() + 1e-10) * 255).astype(np.uint8)
    
    return {
        'clahe_enhanced': encode_image_to_base64(enhanced),
        'local_variance': encode_image_to_base64(local_variance_normalized),
        'max_variance': float(local_variance.max()),
    }


def analyze_luminance_center(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    3. 亮度重心图（Luminance Center of Mass）
    计算 L 通道加权的重心坐标
    """
    lab = color.rgb2lab(rgb_image)
    l_channel = lab[:, :, 0]
    
    # 计算加权重心
    h, w = l_channel.shape
    
    # 使用meshgrid创建坐标矩阵，确保正确的x和y对应关系
    x_coords = np.arange(w).reshape(1, -1).repeat(h, axis=0)  # x坐标：列索引
    y_coords = np.arange(h).reshape(-1, 1).repeat(w, axis=1)  # y坐标：行索引
    
    # 计算加权平均（使用L通道值作为权重）
    total_weight = np.sum(l_channel)
    if total_weight > 0:
        center_x = np.sum(x_coords * l_channel) / total_weight
        center_y = np.sum(y_coords * l_channel) / total_weight
    else:
        center_x = w / 2
        center_y = h / 2
    
    # 确保坐标在有效范围内
    center_x = np.clip(center_x, 0, w - 1)
    center_y = np.clip(center_y, 0, h - 1)
    
    # 创建标记图
    l_normalized = (l_channel / 100.0 * 255).astype(np.uint8)
    marked_image = cv2.cvtColor(l_normalized, cv2.COLOR_GRAY2RGB)
    
    # 在重心位置画圆（使用BGR格式，红色是(0, 0, 255)）
    center_x_int = int(round(center_x))
    center_y_int = int(round(center_y))
    cv2.circle(marked_image, (center_x_int, center_y_int), max(10, min(w, h) // 30), (0, 0, 255), 2)
    cv2.circle(marked_image, (center_x_int, center_y_int), 3, (0, 0, 255), -1)
    
    return {
        'marked_image': encode_image_to_base64(marked_image),
        'center_x': float(center_x),
        'center_y': float(center_y),
        'center_x_percent': float(center_x / w * 100),
        'center_y_percent': float(center_y / h * 100),
    }


# ========== ② 色彩质量（Color Quality）==========

def analyze_hue_distribution(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    1. 色相分布图（Hue Map）
    转 HSV，取 H 通道，可视化为色相圈
    """
    hsv = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2HSV)
    h_channel = hsv[:, :, 0]  # 0-179
    
    # 创建色相可视化（将 H 映射到 RGB）
    h_normalized = (h_channel / 179.0 * 255).astype(np.uint8)
    hue_visualization = cv2.applyColorMap(h_normalized, cv2.COLORMAP_HSV)
    hue_visualization = cv2.cvtColor(hue_visualization, cv2.COLOR_BGR2RGB)
    
    # 计算色相直方图
    hist, bins = np.histogram(h_channel, bins=36, range=(0, 180))
    dominant_hues = np.argsort(hist)[-5:][::-1]  # 前5个主要色相
    
    return {
        'hue_map': encode_image_to_base64(hue_visualization),
        'hue_channel': encode_image_to_base64(h_channel),
        'dominant_hues': [int(bins[i]) for i in dominant_hues],
        'hue_histogram': hist.tolist(),
    }


def analyze_saturation_distribution(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    2. 饱和度分布图（Saturation Map）
    取 S 通道，灰底上显示饱和度强弱
    """
    hsv = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2HSV)
    s_channel = hsv[:, :, 1]  # 0-255
    
    # 创建可视化：灰色背景 + 饱和度叠加
    gray_bg = np.full_like(rgb_image, 128)
    saturation_overlay = np.zeros_like(rgb_image)
    saturation_overlay[:, :, 0] = s_channel
    saturation_overlay[:, :, 1] = s_channel
    saturation_overlay[:, :, 2] = s_channel
    
    # 混合
    alpha = s_channel.astype(np.float32) / 255.0
    alpha = np.stack([alpha, alpha, alpha], axis=2)
    visualization = (gray_bg * (1 - alpha) + saturation_overlay * alpha).astype(np.uint8)
    
    return {
        'saturation_map': encode_image_to_base64(visualization),
        'saturation_channel': encode_image_to_base64(s_channel),
        'mean_saturation': float(np.mean(s_channel)),
        'high_saturation_ratio': float(np.sum(s_channel > 200) / s_channel.size),
    }


def analyze_desaturated_readability(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    3. 去饱和可读性（Good Grayscale）
    生成灰度图 + 标记灰度冲突区域
    """
    lab = color.rgb2lab(rgb_image)
    l_channel = lab[:, :, 0]
    l_normalized = (l_channel / 100.0 * 255).astype(np.uint8)
    
    # 计算 HSV 色相差异
    hsv = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2HSV)
    h_channel = hsv[:, :, 0].astype(np.float32)
    
    # 找出色相不同但亮度接近的区域（冲突区域）
    # 性能优化：使用uniform_filter替代generic_filter，速度提升约5-10倍
    # 使用更大的核（7x7）但降低采样率，平衡精度和性能
    filter_size = 7
    # 使用uniform_filter计算局部均值（比generic_filter快得多）
    local_mean = ndimage.uniform_filter(l_normalized.astype(np.float32), size=filter_size)
    local_mean_sq = ndimage.uniform_filter((l_normalized.astype(np.float32))**2, size=filter_size)
    local_variance = local_mean_sq - local_mean**2
    local_std = np.sqrt(np.clip(local_variance, 0, None))
    
    # 计算色相方差（同样使用uniform_filter优化）
    hue_mean = ndimage.uniform_filter(h_channel, size=filter_size)
    hue_mean_sq = ndimage.uniform_filter(h_channel**2, size=filter_size)
    hue_variance = hue_mean_sq - hue_mean**2
    
    # 低标准差但高色相变化 = 冲突
    conflict_mask = (local_std < 10) & (hue_variance > 50)
    
    # 标记冲突区域
    marked_image = cv2.cvtColor(l_normalized, cv2.COLOR_GRAY2RGB)
    marked_image[conflict_mask] = [255, 0, 0]  # 红色标记
    
    return {
        'grayscale': encode_image_to_base64(l_normalized),
        'conflict_marked': encode_image_to_base64(marked_image),
        'conflict_ratio': float(np.sum(conflict_mask) / conflict_mask.size),
    }


def analyze_gamut_shift(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    4. 色域偏移（Gamut Shift）
    统计饱和度与亮度的极端值，标出过曝/过暗/高饱和区域
    """
    hsv = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2HSV)
    v_channel = hsv[:, :, 2]  # 亮度
    s_channel = hsv[:, :, 1]  # 饱和度
    
    # 标记极端区域
    overexposed = v_channel > 250  # 过曝
    underexposed = v_channel < 10  # 过暗
    oversaturated = s_channel > 240  # 过饱和
    
    # 创建标记图
    marked_image = rgb_image.copy()
    marked_image[overexposed] = [255, 255, 0]  # 黄色标记过曝
    marked_image[underexposed] = [0, 0, 255]  # 蓝色标记过暗
    marked_image[oversaturated] = [255, 0, 255]  # 品红标记过饱和
    
    return {
        'marked_image': encode_image_to_base64(marked_image),
        'overexposed_ratio': float(np.sum(overexposed) / overexposed.size),
        'underexposed_ratio': float(np.sum(underexposed) / underexposed.size),
        'oversaturated_ratio': float(np.sum(oversaturated) / oversaturated.size),
    }


# ========== ③ 形体可读性（Shape Readability）==========

def analyze_edge_sharpness(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    1. 边缘清晰度（Edge Sharpness）
    使用 Canny 和 Sobel 检测边缘
    """
    gray = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2GRAY)
    
    # Canny 边缘检测
    edges_canny = cv2.Canny(gray, 50, 150)
    
    # Sobel 边缘强度
    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    sobel_magnitude = np.sqrt(sobelx**2 + sobely**2)
    sobel_normalized = (sobel_magnitude / sobel_magnitude.max() * 255).astype(np.uint8)
    
    # 边缘热力图
    heatmap = cv2.applyColorMap(sobel_normalized, cv2.COLORMAP_JET)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    
    return {
        'canny_edges': encode_image_to_base64(edges_canny),
        'sobel_magnitude': encode_image_to_base64(sobel_normalized),
        'edge_heatmap': encode_image_to_base64(heatmap),
        'edge_density': float(np.sum(edges_canny > 0) / edges_canny.size),
    }


def analyze_feature_focus(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    2. 特征点焦点（Feature Focus）
    使用 Harris 角点检测，生成特征点密度热力图
    """
    gray = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2GRAY)
    
    # Harris 角点检测
    corners = cv2.cornerHarris(gray, 2, 3, 0.04)
    corners = cv2.dilate(corners, None)
    
    # 创建热力图
    corners_normalized = (corners / corners.max() * 255).astype(np.uint8)
    heatmap = cv2.applyColorMap(corners_normalized, cv2.COLORMAP_HOT)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    
    # 标记特征点
    marked_image = rgb_image.copy()
    marked_image[corners > 0.01 * corners.max()] = [0, 255, 0]  # 绿色标记
    
    # 计算特征点密度
    feature_points = corners > 0.01 * corners.max()
    
    return {
        'feature_heatmap': encode_image_to_base64(heatmap),
        'marked_image': encode_image_to_base64(marked_image),
        'feature_density': float(np.sum(feature_points) / feature_points.size),
        'feature_count': int(np.sum(feature_points)),
    }


def analyze_frequency_domain(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    3. 画面花密度（Visual Noise / FT 频域分析）
    使用 FFT 分析高频成分
    """
    gray = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2GRAY)
    
    # FFT
    f_transform = np.fft.fft2(gray)
    f_shift = np.fft.fftshift(f_transform)
    magnitude_spectrum = np.log(np.abs(f_shift) + 1)
    
    # 归一化
    magnitude_normalized = (magnitude_spectrum / magnitude_spectrum.max() * 255).astype(np.uint8)
    
    # 高频成分（中心区域外的部分）
    h, w = gray.shape
    center_y, center_x = h // 2, w // 2
    y, x = np.ogrid[:h, :w]
    mask = (x - center_x)**2 + (y - center_y)**2 > (min(h, w) * 0.3)**2
    
    high_freq = np.zeros_like(magnitude_spectrum)
    high_freq[mask] = magnitude_spectrum[mask]
    high_freq_normalized = (high_freq / magnitude_spectrum.max() * 255).astype(np.uint8)
    
    # 热力图
    heatmap = cv2.applyColorMap(high_freq_normalized, cv2.COLORMAP_VIRIDIS)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    
    return {
        'fft_spectrum': encode_image_to_base64(magnitude_normalized),
        'high_freq_heatmap': encode_image_to_base64(heatmap),
        'high_freq_energy': float(np.sum(high_freq)),
    }


# ========== ④ 色块结构（Color Block Structure）==========

def analyze_colormax_segmentation(rgb_image: np.ndarray, target_n: int = 8) -> Dict[str, Any]:
    """
    ColorMax 风格的色卡提取算法（替代 k-means）
    
    算法流程：
    1. 将图片从 sRGB 转为 CIE Lab（感知空间）
    2. 对 Lab 的像素进行自适应分箱（L 通道 35 段；色相 1224 段；饱和度 3 段）
    3. 使用层级聚类（Agglomerative Clustering），距离度量为 Lab 欧氏距离
    4. 合并占比极小的小簇（<0.5%）到最近的主簇
    5. 计算每个簇的统计信息
    
    Args:
        rgb_image: RGB图像数组
        target_n: 目标簇数量，默认8
    
    Returns:
        与 k-means 结果兼容的字典结构
    """
    # 1. 转换为 CIE Lab（感知空间）
    lab = color.rgb2lab(rgb_image)
    h, w = lab.shape[:2]
    total_pixels = h * w
    
    # 重塑为像素列表
    pixels_lab = lab.reshape(-1, 3)  # (N, 3)
    
    # 性能优化：降采样（允许降采样，但最终平均色必须从原图像像素计算）
    # 对于大图，先降采样进行分箱和聚类，最后用原图计算平均色
    sample_factor = max(1, int(np.sqrt(total_pixels) / 400))  # 类似原k-means的采样策略
    if sample_factor > 1:
        pixels_sampled = pixels_lab[::sample_factor]
    else:
        pixels_sampled = pixels_lab
    
    # 2. 自适应分箱
    # L 通道：35 段（0-100 分为 35 段）
    # 色相：1224 段（基于 a, b 通道计算色相角，0-360度分为1224段）
    # 饱和度：3 段（基于 a, b 通道的饱和度，分为低/中/高）
    
    L = pixels_sampled[:, 0]  # L: 0-100
    a = pixels_sampled[:, 1]  # a: -128 to 127
    b = pixels_sampled[:, 2]  # b: -128 to 127
    
    # 计算色相角（基于 a, b）
    hue_angle = np.arctan2(b, a)  # -π to π
    hue_angle = np.degrees(hue_angle) + 180  # 0-360度
    
    # 计算饱和度（chroma）
    chroma = np.sqrt(a**2 + b**2)  # 0 to ~180
    
    # 分箱
    L_bins = np.clip((L / 100.0 * 35).astype(int), 0, 34)  # 0-34
    hue_bins = np.clip((hue_angle / 360.0 * 1224).astype(int), 0, 1223)  # 0-1223
    # 饱和度分3段：低(0-60), 中(60-120), 高(120+)
    chroma_bins = np.clip((chroma / 60.0).astype(int), 0, 2)  # 0-2
    
    # 组合分箱索引（使用唯一标识）
    bin_indices = L_bins * 1224 * 3 + hue_bins * 3 + chroma_bins
    
    # 统计各 bin 的像素平均色
    unique_bins, bin_counts = np.unique(bin_indices, return_counts=True)
    bin_means = {}
    for bin_idx in unique_bins:
        mask = bin_indices == bin_idx
        bin_means[bin_idx] = {
            'lab_mean': np.mean(pixels_sampled[mask], axis=0),
            'count': bin_counts[unique_bins == bin_idx][0]
        }
    
    # 准备聚类样本（使用 bin 的均值）
    n_bins = len(bin_means)
    if n_bins < target_n:
        # 如果 bin 数量少于目标簇数，直接使用 bin
        cluster_centers_lab = np.array([bin_means[idx]['lab_mean'] for idx in unique_bins])
        bin_to_cluster = {idx: i for i, idx in enumerate(unique_bins)}
    else:
        # 3. 层级聚类（Agglomerative Clustering）
        # 使用 scipy 的 linkage 和 fcluster
        bin_centers = np.array([bin_means[idx]['lab_mean'] for idx in unique_bins])
        
        # 计算距离矩阵（Lab 欧氏距离）
        # 使用 condensed distance matrix（节省内存）
        from scipy.spatial.distance import pdist, squareform
        distances = pdist(bin_centers, metric='euclidean')
        
        # 层级聚类
        linkage_matrix = linkage(distances, method='ward')
        
        # 聚成 target_n 个簇
        cluster_labels = fcluster(linkage_matrix, target_n, criterion='maxclust')
        
        # 计算每个簇的中心（Lab 空间）
        cluster_centers_lab = []
        bin_to_cluster = {}
        for cluster_id in range(1, target_n + 1):
            cluster_mask = cluster_labels == cluster_id
            cluster_bins = unique_bins[cluster_mask]
            if len(cluster_bins) > 0:
                # 加权平均（按 bin 的像素数加权）
                weights = np.array([bin_means[idx]['count'] for idx in cluster_bins])
                cluster_center = np.average(
                    [bin_means[idx]['lab_mean'] for idx in cluster_bins],
                    axis=0,
                    weights=weights
                )
                cluster_centers_lab.append(cluster_center)
                for idx in cluster_bins:
                    bin_to_cluster[idx] = len(cluster_centers_lab) - 1
        
        cluster_centers_lab = np.array(cluster_centers_lab)
    
    # 4. 合并小簇（<0.5%）
    # 先计算每个簇的占比
    cluster_sizes = np.zeros(len(cluster_centers_lab))
    for bin_idx, cluster_id in bin_to_cluster.items():
        cluster_sizes[cluster_id] += bin_means[bin_idx]['count']
    
    cluster_ratios = cluster_sizes / len(pixels_sampled)
    min_ratio = 0.005  # 0.5%
    
    # 找出小簇并合并到最近的主簇
    small_clusters = np.where(cluster_ratios < min_ratio)[0]
    main_clusters = np.where(cluster_ratios >= min_ratio)[0]
    
    if len(small_clusters) > 0 and len(main_clusters) > 0:
        # 计算簇间距离
        from scipy.spatial.distance import cdist
        cluster_distances = cdist(cluster_centers_lab, cluster_centers_lab)
        np.fill_diagonal(cluster_distances, np.inf)  # 忽略自身
        
        # 合并小簇到最近的主簇（确保 nearest_main 是主簇）
        for small_cluster_id in small_clusters:
            # 只考虑主簇的距离
            distances_to_main = cluster_distances[small_cluster_id][main_clusters]
            nearest_main_idx = np.argmin(distances_to_main)
            nearest_main = main_clusters[nearest_main_idx]
            # 更新 bin_to_cluster 映射
            for bin_idx, cluster_id in list(bin_to_cluster.items()):
                if cluster_id == small_cluster_id:
                    bin_to_cluster[bin_idx] = nearest_main
        
        # 重新计算簇中心和占比
        final_clusters = set(bin_to_cluster.values())
        cluster_centers_lab = []
        cluster_sizes = np.zeros(len(final_clusters))
        old_to_new = {old_id: new_id for new_id, old_id in enumerate(sorted(final_clusters))}
        
        for bin_idx, old_cluster_id in bin_to_cluster.items():
            new_cluster_id = old_to_new[old_cluster_id]
            bin_to_cluster[bin_idx] = new_cluster_id
            cluster_sizes[new_cluster_id] += bin_means[bin_idx]['count']
        
        # 重新计算簇中心（加权平均）
        for new_cluster_id in range(len(final_clusters)):
            cluster_bins = [idx for idx, cid in bin_to_cluster.items() if cid == new_cluster_id]
            if len(cluster_bins) > 0:
                weights = np.array([bin_means[idx]['count'] for idx in cluster_bins])
                cluster_center = np.average(
                    [bin_means[idx]['lab_mean'] for idx in cluster_bins],
                    axis=0,
                    weights=weights
                )
                cluster_centers_lab.append(cluster_center)
        
        cluster_centers_lab = np.array(cluster_centers_lab)
        cluster_ratios = cluster_sizes / len(pixels_sampled)
        cluster_ratios = cluster_ratios[cluster_ratios > 0]  # 移除空簇
    
    # 5. 对所有原图像素分配簇（使用原图，不是采样图）
    # 计算每个像素属于哪个 bin，然后映射到簇
    L_full = pixels_lab[:, 0]
    a_full = pixels_lab[:, 1]
    b_full = pixels_lab[:, 2]
    hue_angle_full = np.degrees(np.arctan2(b_full, a_full)) + 180
    chroma_full = np.sqrt(a_full**2 + b_full**2)
    
    L_bins_full = np.clip((L_full / 100.0 * 35).astype(int), 0, 34)
    hue_bins_full = np.clip((hue_angle_full / 360.0 * 1224).astype(int), 0, 1223)
    chroma_bins_full = np.clip((chroma_full / 60.0).astype(int), 0, 2)
    bin_indices_full = L_bins_full * 1224 * 3 + hue_bins_full * 3 + chroma_bins_full
    
    # 对于不在 bin_means 中的像素，找到最近的簇中心
    pixel_labels = np.zeros(len(pixels_lab), dtype=int)
    for i, bin_idx in enumerate(bin_indices_full):
        if bin_idx in bin_to_cluster:
            pixel_labels[i] = bin_to_cluster[bin_idx]
        else:
            # 找到最近的簇中心（Lab 欧氏距离）
            distances_to_centers = np.sqrt(np.sum((pixels_lab[i] - cluster_centers_lab)**2, axis=1))
            pixel_labels[i] = np.argmin(distances_to_centers)
    
    # 重新计算每个簇的平均色（从原图像素计算，确保准确性）
    final_cluster_centers_lab = []
    final_cluster_sizes = []
    for cluster_id in range(len(cluster_centers_lab)):
        cluster_mask = pixel_labels == cluster_id
        if np.sum(cluster_mask) > 0:
            cluster_mean_lab = np.mean(pixels_lab[cluster_mask], axis=0)
            final_cluster_centers_lab.append(cluster_mean_lab)
            final_cluster_sizes.append(np.sum(cluster_mask))
    
    final_cluster_centers_lab = np.array(final_cluster_centers_lab)
    final_cluster_ratios = np.array(final_cluster_sizes) / total_pixels
    
    # 重建分割图像
    labels_2d = pixel_labels.reshape(h, w)
    segmented_lab = np.zeros_like(lab)
    for i in range(len(final_cluster_centers_lab)):
        mask = labels_2d == i
        segmented_lab[mask] = final_cluster_centers_lab[i]
    
    # 转换回 RGB
    segmented_rgb = (color.lab2rgb(segmented_lab) * 255).astype(np.uint8)
    
    # 提取主色调（RGB）
    dominant_colors = []
    for center_lab in final_cluster_centers_lab:
        center_rgb = color.lab2rgb(center_lab.reshape(1, 1, 3))[0, 0]
        dominant_colors.append([int(np.clip(c * 255, 0, 255)) for c in center_rgb])
    
    return {
        'segmented_image': encode_image_to_base64(segmented_rgb),
        'cluster_ratios': final_cluster_ratios.tolist(),
        'dominant_colors': dominant_colors,
        'cluster_count': len(final_cluster_centers_lab),
    }


# 保持向后兼容：k-means 函数名改为调用新算法
def analyze_kmeans_segmentation(rgb_image: np.ndarray, k: int = 8) -> Dict[str, Any]:
    """
    向后兼容的 k-means 函数名，实际调用 ColorMax 算法
    """
    return analyze_colormax_segmentation(rgb_image, target_n=k)


def analyze_color_ratio(rgb_image: np.ndarray, kmeans_result: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    2. 色彩比例（Color Ratio）
    统计每个簇面积占比
    
    Args:
        rgb_image: RGB图像
        kmeans_result: 可选的k-means结果，如果提供则复用，避免重复计算
    """
    if kmeans_result is None:
        result = analyze_kmeans_segmentation(rgb_image, k=8)
    else:
        result = kmeans_result
    return {
        'color_ratios': result['cluster_ratios'],
        'dominant_colors': result['dominant_colors'],
        'balance_score': float(1.0 - np.std(result['cluster_ratios'])),  # 越接近1越平衡
    }


def analyze_dominant_palette(rgb_image: np.ndarray, kmeans_result: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    3. 主色调（Dominant Palette）
    提取 3-5 个代表色
    
    Args:
        rgb_image: RGB图像
        kmeans_result: 可选的k-means结果，如果提供则复用，避免重复计算
    """
    if kmeans_result is None:
        result = analyze_kmeans_segmentation(rgb_image, k=8)
    else:
        result = kmeans_result
    
    # 按面积排序
    sorted_indices = np.argsort(result['cluster_ratios'])[::-1]
    top_colors = [result['dominant_colors'][i] for i in sorted_indices[:5]]
    
    return {
        'palette': top_colors,
        'palette_ratios': [result['cluster_ratios'][i] for i in sorted_indices[:5]],
    }


# ========== ⑤ 纹理方向（Texture Orientation）==========

def analyze_texture_orientation(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    1. 纹理方向性（Gabor / Sobel Orientation）
    使用 Sobel 计算纹理方向场
    """
    gray = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2GRAY)
    
    # Sobel 方向
    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    
    # 计算方向（角度）
    orientation = np.arctan2(sobely, sobelx)
    orientation_degrees = np.degrees(orientation) + 180  # 0-360
    
    # 可视化方向场（HSV：色相=方向，饱和度=强度，亮度=强度）
    magnitude = np.sqrt(sobelx**2 + sobely**2)
    magnitude_normalized = (magnitude / magnitude.max() * 255).astype(np.uint8)
    
    h_channel = (orientation_degrees / 360.0 * 179).astype(np.uint8)
    s_channel = np.full_like(h_channel, 255)
    v_channel = magnitude_normalized
    
    hsv_orientation = np.stack([h_channel, s_channel, v_channel], axis=2)
    orientation_rgb = cv2.cvtColor(hsv_orientation, cv2.COLOR_HSV2RGB)
    
    return {
        'orientation_field': encode_image_to_base64(orientation_rgb),
        'mean_orientation': float(np.mean(orientation_degrees)),
        'orientation_std': float(np.std(orientation_degrees)),
    }


def analyze_texture_coherence(rgb_image: np.ndarray) -> Dict[str, Any]:
    """
    2. 纹理一致性（Coherence）
    使用结构张量计算一致性
    """
    gray = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2GRAY).astype(np.float32)
    
    # 计算梯度
    gx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    
    # 结构张量
    gxx = gx * gx
    gyy = gy * gy
    gxy = gx * gy
    
    # 高斯平滑
    sigma = 2.0
    gxx_smooth = cv2.GaussianBlur(gxx, (0, 0), sigma)
    gyy_smooth = cv2.GaussianBlur(gyy, (0, 0), sigma)
    gxy_smooth = cv2.GaussianBlur(gxy, (0, 0), sigma)
    
    # 计算特征值和一致性
    trace = gxx_smooth + gyy_smooth
    det = gxx_smooth * gyy_smooth - gxy_smooth**2
    
    # 一致性 = (lambda1 - lambda2) / (lambda1 + lambda2)
    coherence = np.zeros_like(trace)
    mask = trace > 0
    coherence[mask] = np.sqrt(trace[mask]**2 - 4 * det[mask]) / trace[mask]
    coherence = np.clip(coherence, 0, 1)
    
    # 可视化
    coherence_uint8 = (coherence * 255).astype(np.uint8)
    heatmap = cv2.applyColorMap(coherence_uint8, cv2.COLORMAP_VIRIDIS)
    heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    
    return {
        'coherence_map': encode_image_to_base64(heatmap),
        'mean_coherence': float(np.mean(coherence)),
        'high_coherence_ratio': float(np.sum(coherence > 0.7) / coherence.size),
    }


# ========== 主分析函数 ==========

def analyze_image_comprehensive(image_data: str) -> Dict[str, Any]:
    """
    综合图像分析
    返回所有模块的分析结果
    
    注意：图片会在decode_base64_image中自动压缩（默认800px，可通过IMAGE_ANALYSIS_MAX_SIDE配置）
    性能优化：
    - 图片尺寸：800px（减少73%计算量）
    - K-means采样：减少75%计算量
    - 使用uniform_filter替代generic_filter：提升5-10倍速度
    """
    import gc
    from django.conf import settings
    max_side = getattr(settings, 'IMAGE_ANALYSIS_MAX_SIDE', 800)
    # 解码图片（会自动压缩，减少计算量和内存使用）
    rgb_image = decode_base64_image(image_data, max_side=max_side)
    
    # 执行分析（按顺序执行，避免内存峰值）
    results = {}
    
    try:
        # 1. 明暗结构（最快）
        results['value_structure'] = {
            'lab_luminance': analyze_lab_luminance(rgb_image),
        }
        
        # 2. 色彩质量（中等耗时）
        results['color_quality'] = {
            'hue_distribution': analyze_hue_distribution(rgb_image),
            'saturation_distribution': analyze_saturation_distribution(rgb_image),
        }
        
        # 3. 形体可读性（已删除edge_sharpness）
        results['shape_readability'] = {}
        
        # 4. 色块结构（最耗时，使用采样优化）
        # 先计算一次k-means，然后复用结果给其他函数，确保结果一致
        # 主色调从5个增加到8个
        kmeans_result = analyze_kmeans_segmentation(rgb_image, k=8)
        results['color_block_structure'] = {
            'kmeans_segmentation': kmeans_result,
            'color_ratio': analyze_color_ratio(rgb_image, kmeans_result),
            'dominant_palette': analyze_dominant_palette(rgb_image, kmeans_result),
        }
        
    finally:
        # 显式释放大数组内存（帮助GC回收）
        del rgb_image
        gc.collect()
    
    return results

