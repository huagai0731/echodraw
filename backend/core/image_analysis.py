"""
专业绘画分析系统
基于 OpenCV + scikit-image 实现
"""

import base64
import io
import logging
from typing import Dict, List, Tuple, Any
import numpy as np
import cv2
from PIL import Image
from skimage import color
from skimage.morphology import disk
from scipy import ndimage
from scipy.cluster.hierarchy import linkage, fcluster
from PIL import ImageOps

logger = logging.getLogger(__name__)


def load_image_from_url(image_url: str, max_side: int = 800) -> np.ndarray:
    """
    从 URL（TOS 或其他）加载图片并转换为 numpy 数组
    并进行压缩处理
    
    Args:
        image_url: 图片的 URL
        max_side: 最大边长，默认1536
    
    Returns:
        RGB格式的numpy数组
    """
    import requests
    from PIL import ImageOps
    
    # 从 URL 下载图片
    response = requests.get(image_url, timeout=30)
    response.raise_for_status()
    
    image = Image.open(io.BytesIO(response.content))
    
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


def numpy_to_pil_image(image: np.ndarray) -> Image.Image:
    """将 numpy 数组转换为 PIL Image"""
    # 确保是 uint8 类型
    if image.dtype != np.uint8:
        if image.max() <= 1.0:
            image = (image * 255).astype(np.uint8)
        else:
            image = image.astype(np.uint8)
    
    # 转换为 PIL Image
    if len(image.shape) == 2:
        # 灰度图
        return Image.fromarray(image, mode='L')
    elif len(image.shape) == 3:
        # RGB 图
        return Image.fromarray(image, mode='RGB')
    else:
        raise ValueError(f"不支持的图像形状: {image.shape}")


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
    # 优化：提高采样率，减少计算量（从600改为800，进一步减少计算量）
    sample_factor = max(1, int(np.sqrt(total_pixels) / 800))  # 优化：提高采样阈值，减少计算量
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
        # 3. 聚类算法选择
        # 使用 scipy 的 linkage 和 fcluster
        bin_centers = np.array([bin_means[idx]['lab_mean'] for idx in unique_bins])
        
        # 内存和性能优化：如果bin数量很大，直接使用K-means（更快且更节省内存）
        # 对于大量bin，层级聚类可能消耗大量内存和时间
        use_kmeans_fallback = False
        if n_bins > 3000:
            # 如果bin数量超过3000，先尝试降采样到5000，如果还是太大则使用K-means
            if n_bins > 5000:
                # 如果bin数量超过5000，直接使用K-means（性能更好）
                logger.info(f"K-means分析：bin数量过多({n_bins})，使用K-means算法以提升性能")
                use_kmeans_fallback = True
            else:
                # 如果bin数量在3000-5000之间，降采样到3000
                logger.warning(f"K-means分析：bin数量较多({n_bins})，进行降采样以提升性能")
                import random
                sampled_indices = random.sample(range(n_bins), 3000)
                bin_centers = bin_centers[sampled_indices]
                unique_bins = unique_bins[sampled_indices]
                n_bins = 3000
                # 重新构建bin_means（只保留采样的bin）
                bin_means = {unique_bins[i]: bin_means[unique_bins[i]] for i in range(n_bins)}
        elif n_bins > 2000:
            # 如果bin数量超过2000，进行降采样到2000
            logger.warning(f"K-means分析：bin数量较多({n_bins})，进行降采样以提升性能")
            import random
            sampled_indices = random.sample(range(n_bins), 2000)
            bin_centers = bin_centers[sampled_indices]
            unique_bins = unique_bins[sampled_indices]
            n_bins = 2000
            # 重新构建bin_means（只保留采样的bin）
            bin_means = {unique_bins[i]: bin_means[unique_bins[i]] for i in range(n_bins)}
        
        if use_kmeans_fallback:
            # 直接使用K-means（更快）
            from sklearn.cluster import KMeans
            kmeans = KMeans(n_clusters=target_n, random_state=42, n_init=10, max_iter=100)
            cluster_labels = kmeans.fit_predict(bin_centers) + 1  # +1 因为fcluster从1开始
            cluster_centers_lab = kmeans.cluster_centers_
            bin_to_cluster = {unique_bins[i]: cluster_labels[i] - 1 for i in range(len(unique_bins))}
        else:
            # 层级聚类（仅用于bin数量较少的情况）
            try:
                # 计算距离矩阵（Lab 欧氏距离）
                # 使用 condensed distance matrix（节省内存）
                from scipy.spatial.distance import pdist
                distances = pdist(bin_centers, metric='euclidean')
                linkage_matrix = linkage(distances, method='ward')
                # 聚成 target_n 个簇
                cluster_labels = fcluster(linkage_matrix, target_n, criterion='maxclust')
                
                # 确保 cluster_labels 的大小与 unique_bins 一致
                if len(cluster_labels) != len(unique_bins):
                    logger.error(f"K-means分析：cluster_labels大小({len(cluster_labels)})与unique_bins大小({len(unique_bins)})不匹配，使用K-means回退")
                    raise MemoryError("cluster_labels和unique_bins大小不匹配，回退到K-means")
                
                # 计算每个簇的中心（Lab 空间）
                cluster_centers_lab = []
                bin_to_cluster = {}
                for cluster_id in range(1, target_n + 1):
                    cluster_mask = cluster_labels == cluster_id
                    # 再次检查大小匹配
                    if len(cluster_mask) != len(unique_bins):
                        logger.error(f"K-means分析：cluster_mask大小({len(cluster_mask)})与unique_bins大小({len(unique_bins)})不匹配，使用K-means回退")
                        raise MemoryError("cluster_mask和unique_bins大小不匹配，回退到K-means")
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
            except (MemoryError, ValueError, IndexError) as e:
                logger.error(f"K-means分析：层级聚类失败，bin数量: {n_bins}, 错误: {str(e)}")
                # 如果层级聚类失败（内存不足或索引错误），回退到简单的K-means
                from sklearn.cluster import KMeans
                # 确保 bin_centers 和 unique_bins 大小一致
                if len(bin_centers) != len(unique_bins):
                    logger.warning(f"K-means分析：bin_centers大小({len(bin_centers)})与unique_bins大小({len(unique_bins)})不匹配，重新构建")
                    # 重新构建 bin_centers 和 unique_bins，确保它们一致
                    unique_bins_list = list(unique_bins)
                    bin_centers = np.array([bin_means[idx]['lab_mean'] for idx in unique_bins_list])
                    unique_bins = np.array(unique_bins_list)
                kmeans = KMeans(n_clusters=target_n, random_state=42, n_init=10, max_iter=100)
                cluster_labels = kmeans.fit_predict(bin_centers) + 1  # +1 因为fcluster从1开始
                cluster_centers_lab = kmeans.cluster_centers_
                bin_to_cluster = {unique_bins[i]: cluster_labels[i] - 1 for i in range(len(unique_bins))}
    
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
    # 性能优化：使用向量化操作替代循环
    L_full = pixels_lab[:, 0]
    a_full = pixels_lab[:, 1]
    b_full = pixels_lab[:, 2]
    hue_angle_full = np.degrees(np.arctan2(b_full, a_full)) + 180
    chroma_full = np.sqrt(a_full**2 + b_full**2)
    
    L_bins_full = np.clip((L_full / 100.0 * 35).astype(int), 0, 34)
    hue_bins_full = np.clip((hue_angle_full / 360.0 * 1224).astype(int), 0, 1223)
    chroma_bins_full = np.clip((chroma_full / 60.0).astype(int), 0, 2)
    bin_indices_full = L_bins_full * 1224 * 3 + hue_bins_full * 3 + chroma_bins_full
    
    # 性能优化：使用向量化操作替代循环
    # 先批量查找已知的 bin_to_cluster 映射
    pixel_labels = np.zeros(len(pixels_lab), dtype=int)
    
    # 对于在 bin_means 中的像素，直接使用映射
    known_bins = np.array(list(bin_to_cluster.keys()))
    known_clusters = np.array(list(bin_to_cluster.values()))
    
    # 使用 searchsorted 快速查找（需要先排序）
    sorted_indices = np.argsort(known_bins)
    sorted_bins = known_bins[sorted_indices]
    sorted_clusters = known_clusters[sorted_indices]
    
    # 对于每个像素的 bin_idx，查找是否在 known_bins 中
    # 使用 searchsorted 进行二分查找
    search_indices = np.searchsorted(sorted_bins, bin_indices_full, side='left')
    # 检查是否找到匹配
    mask_found = (search_indices < len(sorted_bins)) & (sorted_bins[np.clip(search_indices, 0, len(sorted_bins)-1)] == bin_indices_full)
    
    # 对于找到的像素，直接赋值
    pixel_labels[mask_found] = sorted_clusters[np.clip(search_indices[mask_found], 0, len(sorted_clusters)-1)]
    
    # 对于未找到的像素（不在 bin_means 中），批量计算距离
    mask_not_found = ~mask_found
    if np.any(mask_not_found):
        # 向量化计算所有未找到像素到所有簇中心的距离
        pixels_not_found = pixels_lab[mask_not_found]
        # 使用广播计算距离矩阵 (N_pixels, N_clusters)
        distances = np.sqrt(np.sum((pixels_not_found[:, np.newaxis, :] - cluster_centers_lab[np.newaxis, :, :])**2, axis=2))
        # 找到最近的簇
        pixel_labels[mask_not_found] = np.argmin(distances, axis=1)
    
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


def analyze_dominant_palette(rgb_image: np.ndarray, kmeans_result: Dict[str, Any] = None, top_n: int = 5) -> Dict[str, Any]:
    """
    3. 主色调（Dominant Palette）
    提取指定数量的代表色
    
    Args:
        rgb_image: RGB图像
        kmeans_result: 可选的k-means结果，如果提供则复用，避免重复计算
        top_n: 返回前N个主色调，默认5
    """
    if kmeans_result is None:
        result = analyze_kmeans_segmentation(rgb_image, k=8)
    else:
        result = kmeans_result
    
    # 按面积排序
    sorted_indices = np.argsort(result['cluster_ratios'])[::-1]
    # 确保不超过实际颜色簇数量
    actual_top_n = min(top_n, len(sorted_indices))
    top_colors = [result['dominant_colors'][i] for i in sorted_indices[:actual_top_n]]
    
    return {
        'palette': top_colors,
        'palette_ratios': [result['cluster_ratios'][i] for i in sorted_indices[:actual_top_n]],
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

def analyze_image_simplified(image_data: str, binary_threshold: int = 140) -> Dict[str, Any]:
    """
    简化的图像分析流程（固定5步）
    
    Step1: 二值化 + 3阶4阶层灰度图（3张图）
    Step2: RGB转明度 + LAB转视觉明度（2张图）
    Step3: HLS转饱和度 + HLS转饱和度的反色（2张图）
    Step4: 色相图 + 色相直方图数据
    Step5: 色块分割图 + 主色调分析数据
    
    注意：图片会在decode_base64_image中自动压缩（默认800px，可通过IMAGE_ANALYSIS_MAX_SIDE配置）
    """
    import gc
    from django.conf import settings
    max_side = getattr(settings, 'IMAGE_ANALYSIS_MAX_SIDE', 800)
    # 解码图片（会自动压缩，减少计算量和内存使用）
    rgb_image = decode_base64_image(image_data, max_side=max_side)
    
    results = {}
    
    try:
        # Step1: 二值化 + 3阶4阶层灰度图
        gray = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2GRAY)
        
        # 二值化
        _, binary = cv2.threshold(gray, binary_threshold, 255, cv2.THRESH_BINARY)
        
        # 3阶层灰度（0, 127, 255）
        gray_3_level = gray.copy()
        gray_3_level[gray < 85] = 0
        gray_3_level[(gray >= 85) & (gray < 170)] = 127
        gray_3_level[gray >= 170] = 255
        
        # 4阶层灰度（0, 85, 170, 255）
        gray_4_level = gray.copy()
        gray_4_level[gray < 64] = 0
        gray_4_level[(gray >= 64) & (gray < 128)] = 85
        gray_4_level[(gray >= 128) & (gray < 192)] = 170
        gray_4_level[gray >= 192] = 255
        
        results['step1'] = {
            'binary': encode_image_to_base64(binary),
            'grayscale_3_level': encode_image_to_base64(gray_3_level),
            'grayscale_4_level': encode_image_to_base64(gray_4_level),
        }
        
        # Step2: RGB转明度 + LAB转视觉明度
        # RGB转明度（使用标准公式：0.299*R + 0.587*G + 0.114*B）
        rgb_luminance = (0.299 * rgb_image[:, :, 0] + 
                         0.587 * rgb_image[:, :, 1] + 
                         0.114 * rgb_image[:, :, 2]).astype(np.uint8)
        
        # LAB转视觉明度
        lab = color.rgb2lab(rgb_image)
        l_channel = lab[:, :, 0]  # L 通道范围 0-100
        lab_luminance = (l_channel / 100.0 * 255).astype(np.uint8)
        
        results['step2'] = {
            'rgb_luminance': encode_image_to_base64(rgb_luminance),
            'lab_luminance': encode_image_to_base64(lab_luminance),
        }
        
        # Step3: HLS转饱和度 + HLS转饱和度的反色
        hls = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2HLS)
        hls_s_channel = hls[:, :, 2]  # S 通道（HLS中S是饱和度，范围0-255）
        
        # HLS饱和度反色
        hls_s_inverted = 255 - hls_s_channel
        
        results['step3'] = {
            'hls_saturation': encode_image_to_base64(hls_s_channel),
            'hls_saturation_inverted': encode_image_to_base64(hls_s_inverted),
        }
        
        # Step4: 色相图 + 色相直方图数据
        hsv = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2HSV)
        h_channel = hsv[:, :, 0]  # 0-179
        
        # 创建色相可视化
        h_normalized = (h_channel / 179.0 * 255).astype(np.uint8)
        hue_visualization = cv2.applyColorMap(h_normalized, cv2.COLORMAP_HSV)
        hue_visualization = cv2.cvtColor(hue_visualization, cv2.COLOR_BGR2RGB)
        
        # 计算色相直方图（36个bin）
        hist, bins = np.histogram(h_channel, bins=36, range=(0, 180))
        
        results['step4'] = {
            'hue_map': encode_image_to_base64(hue_visualization),
            'hue_histogram': hist.tolist(),
        }
        
        # Step5: 色块分割图 + 主色调分析数据
        # 8色分析
        kmeans_result_8 = analyze_kmeans_segmentation(rgb_image, k=8)
        dominant_palette_8 = analyze_dominant_palette(rgb_image, kmeans_result_8, top_n=8)
        
        results['step5'] = {
            'kmeans_segmentation_8': kmeans_result_8['segmented_image'],  # 8色色块分割，已经是base64
            'dominant_palette_8': {
                'palette': dominant_palette_8['palette'],
                'palette_ratios': dominant_palette_8['palette_ratios'],
            },
        }
        
    finally:
        # 显式释放大数组内存（帮助GC回收）
        del rgb_image
        gc.collect()
    
    return results


def analyze_image_simplified_from_url(image_url: str, result_id: int, binary_threshold: int = 140, progress_callback=None) -> None:
    """
    从 TOS URL 读取图片，处理，保存结果到 TOS
    
    Args:
        image_url: 图片的 TOS URL
        result_id: VisualAnalysisResult 记录 ID
        binary_threshold: 二值化阈值，默认140
        progress_callback: 可选的进度回调函数，接收进度百分比 (0-100)
    
    Returns:
        None（结果直接保存到数据库）
    """
    import gc
    from django.conf import settings
    from django.core.files.base import ContentFile
    from core.models import VisualAnalysisResult
    
    max_side = getattr(settings, 'IMAGE_ANALYSIS_MAX_SIDE', 800)
    
    # 从 TOS 加载图片
    rgb_image = load_image_from_url(image_url, max_side=max_side)
    
    # 获取结果对象
    result_obj = VisualAnalysisResult.objects.get(id=result_id)
    
    # 辅助函数：将 numpy 数组保存为 PNG 并返回 ContentFile（压缩到400k以下）
    def numpy_to_content_file(image: np.ndarray, filename: str, max_size_bytes: int = 400 * 1024) -> ContentFile:
        """
        将 numpy 数组转换为 PIL Image，压缩到指定大小以下，返回 ContentFile
        
        Args:
            image: numpy 数组
            filename: 文件名
            max_size_bytes: 最大文件大小（字节），默认400KB
        
        Returns:
            ContentFile 对象
        """
        pil_image = numpy_to_pil_image(image)
        buffer = io.BytesIO()
        
        # 先尝试 PNG 格式（对于灰度图，PNG 通常更小）
        # 如果 PNG 太大，尝试 JPEG
        pil_image.save(buffer, format='PNG', optimize=True)
        buffer.seek(0)
        file_size = buffer.tell()
        
        # 如果 PNG 已经小于目标大小，直接返回
        if file_size <= max_size_bytes:
            buffer.seek(0)
            return ContentFile(buffer.getvalue(), name=filename)
        
        # PNG 太大，尝试 JPEG（质量从高到低）
        buffer = io.BytesIO()
        quality = 95
        min_quality = 30
        quality_step = 5
        
        while quality >= min_quality:
            buffer = io.BytesIO()
            # 如果是灰度图，转换为 RGB（JPEG 不支持灰度）
            if pil_image.mode == 'L':
                rgb_image = Image.new('RGB', pil_image.size)
                rgb_image.paste(pil_image)
                rgb_image.save(buffer, format='JPEG', quality=quality, optimize=True)
            else:
                pil_image.save(buffer, format='JPEG', quality=quality, optimize=True)
            
            buffer.seek(0)
            file_size = buffer.tell()
            
            if file_size <= max_size_bytes:
                buffer.seek(0)
                return ContentFile(buffer.getvalue(), name=filename.replace('.png', '.jpg'))
            
            quality -= quality_step
        
        # 如果仍然太大，尝试缩小尺寸
        if file_size > max_size_bytes:
            # 计算缩放因子
            scale_factor = (max_size_bytes / file_size) ** 0.5
            new_width = int(pil_image.width * scale_factor)
            new_height = int(pil_image.height * scale_factor)
            
            # 确保最小尺寸
            if new_width < 100:
                new_width = 100
            if new_height < 100:
                new_height = 100
            
            resized_image = pil_image.resize((new_width, new_height), Image.LANCZOS)
            buffer = io.BytesIO()
            
            # 如果是灰度图，转换为 RGB
            if resized_image.mode == 'L':
                rgb_image = Image.new('RGB', resized_image.size)
                rgb_image.paste(resized_image)
                rgb_image.save(buffer, format='JPEG', quality=min_quality, optimize=True)
            else:
                resized_image.save(buffer, format='JPEG', quality=min_quality, optimize=True)
            
            buffer.seek(0)
            return ContentFile(buffer.getvalue(), name=filename.replace('.png', '.jpg'))
        
        # 如果还是太大，返回压缩后的版本（至少尝试了）
        buffer.seek(0)
        return ContentFile(buffer.getvalue(), name=filename.replace('.png', '.jpg'))
    
    try:
        # 进度：开始处理 (30%)
        if progress_callback:
            progress_callback(30)
        
        # Step1: 二值化 + 3阶4阶层灰度图
        gray = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2GRAY)
        
        # 二值化
        _, binary = cv2.threshold(gray, binary_threshold, 255, cv2.THRESH_BINARY)
        
        # 3阶层灰度（0, 127, 255）
        gray_3_level = gray.copy()
        gray_3_level[gray < 85] = 0
        gray_3_level[(gray >= 85) & (gray < 170)] = 127
        gray_3_level[gray >= 170] = 255
        
        # 4阶层灰度（0, 85, 170, 255）
        gray_4_level = gray.copy()
        gray_4_level[gray < 64] = 0
        gray_4_level[(gray >= 64) & (gray < 128)] = 85
        gray_4_level[(gray >= 128) & (gray < 192)] = 170
        gray_4_level[gray >= 192] = 255
        
        # 进度：Step1 完成 (40%)
        if progress_callback:
            progress_callback(40)
        
        # 保存 Step1 图片到 TOS
        result_obj.step1_binary.save('binary.png', numpy_to_content_file(binary, 'binary.png'))
        result_obj.step2_grayscale_3_level.save('grayscale_3_level.png', numpy_to_content_file(gray_3_level, 'grayscale_3_level.png'))
        result_obj.step2_grayscale_4_level.save('grayscale_4_level.png', numpy_to_content_file(gray_4_level, 'grayscale_4_level.png'))
        
        # 进度：Step1 保存完成 (45%)
        if progress_callback:
            progress_callback(45)
        
        # Step2: RGB转明度 + LAB转视觉明度
        rgb_luminance = (0.299 * rgb_image[:, :, 0] + 
                         0.587 * rgb_image[:, :, 1] + 
                         0.114 * rgb_image[:, :, 2]).astype(np.uint8)
        
        # LAB转视觉明度
        lab = color.rgb2lab(rgb_image)
        l_channel = lab[:, :, 0]  # L 通道范围 0-100
        lab_luminance = (l_channel / 100.0 * 255).astype(np.uint8)
        
        # 保存 Step2 图片到 TOS（RGB转明度保存到step2_grayscale字段，LAB转视觉明度保存到step3_lab_l字段）
        # 注意：Django ImageField 的 save() 方法会自动保存到数据库
        logger.info(f"[analyze_image_simplified_from_url] 开始保存RGB转明度图，result_id: {result_id}")
        try:
            rgb_luminance_file = numpy_to_content_file(rgb_luminance, 'rgb_luminance.png')
            logger.info(f"[analyze_image_simplified_from_url] RGB转明度图文件已生成，准备保存")
            result_obj.step2_grayscale.save('rgb_luminance.png', rgb_luminance_file)
            logger.info(f"[analyze_image_simplified_from_url] RGB转明度图已保存到 step2_grayscale: {result_obj.step2_grayscale.name if result_obj.step2_grayscale else 'None'}")
        except Exception as e:
            logger.error(f"[analyze_image_simplified_from_url] 保存RGB转明度图时发生异常: {str(e)}", exc_info=True)
            raise
        
        logger.info(f"[analyze_image_simplified_from_url] 开始保存LAB转视觉明度图")
        result_obj.step3_lab_l.save('lab_l.png', numpy_to_content_file(lab_luminance, 'lab_l.png'))
        logger.info(f"[analyze_image_simplified_from_url] LAB转视觉明度图已保存到 step3_lab_l")
        
        # 进度：Step2 完成 (55%)
        if progress_callback:
            progress_callback(55)
        
        # Step3: HLS转饱和度 + HLS转饱和度的反色
        hls = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2HLS)
        hls_s_channel = hls[:, :, 2]  # S 通道（HLS中S是饱和度，范围0-255）
        hls_s_inverted = 255 - hls_s_channel
        
        # 保存 Step3 图片到 TOS
        result_obj.step4_hls_s.save('hls_s.png', numpy_to_content_file(hls_s_channel, 'hls_s.png'))
        result_obj.step4_hls_s_inverted.save('hls_s_inverted.png', numpy_to_content_file(hls_s_inverted, 'hls_s_inverted.png'))
        
        # 进度：Step3 完成 (65%)
        if progress_callback:
            progress_callback(65)
        
        # Step4: 色相图 + 色相直方图数据
        hsv = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2HSV)
        h_channel = hsv[:, :, 0]  # 0-179
        
        # 创建色相可视化
        h_normalized = (h_channel / 179.0 * 255).astype(np.uint8)
        hue_visualization = cv2.applyColorMap(h_normalized, cv2.COLORMAP_HSV)
        hue_visualization = cv2.cvtColor(hue_visualization, cv2.COLOR_BGR2RGB)
        
        # 计算色相直方图（36个bin）
        hist, bins = np.histogram(h_channel, bins=36, range=(0, 180))
        
        # 保存 Step4 图片到 TOS
        result_obj.step5_hue.save('hue.png', numpy_to_content_file(hue_visualization, 'hue.png'))
        
        # 进度：Step4 完成 (70%)
        if progress_callback:
            progress_callback(70)
        
        # Step5: 色块分割图 + 主色调分析数据
        # 进度：开始 K-means 分析 (72%)
        if progress_callback:
            progress_callback(72)
        
        # 8色分析
        logger.info(f"[analyze_image_simplified_from_url] 开始8色K-means分析，图片尺寸: {rgb_image.shape}")
        try:
            kmeans_result_8 = analyze_kmeans_segmentation(rgb_image, k=8)
            dominant_palette_8 = analyze_dominant_palette(rgb_image, kmeans_result_8, top_n=8)
            logger.info(f"[analyze_image_simplified_from_url] 8色K-means分析完成")
            
            # 内存优化：立即释放8色分析中的大对象（如果可能）
            import gc
            gc.collect()
        except MemoryError as e:
            logger.error(f"[analyze_image_simplified_from_url] 8色K-means分析内存不足: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"[analyze_image_simplified_from_url] 8色K-means分析失败: {str(e)}", exc_info=True)
            raise
        
        # 进度：8色分析完成 (85%)
        if progress_callback:
            progress_callback(85)
        
        # 辅助函数：将 base64 K-means 图片保存到 ImageField
        def save_kmeans_image_from_base64(base64_str: str, image_field, filename_prefix: str = 'kmeans'):
            """将 base64 格式的 K-means 图片解码、压缩并保存到 ImageField"""
            if ',' in base64_str:
                base64_str = base64_str.split(',')[1]
            kmeans_bytes = base64.b64decode(base64_str)
            
            # 将 base64 解码后的图片加载为 PIL Image，然后压缩
            kmeans_image = Image.open(io.BytesIO(kmeans_bytes))
            kmeans_buffer = io.BytesIO()
            
            # 尝试 PNG
            kmeans_image.save(kmeans_buffer, format='PNG', optimize=True)
            kmeans_buffer.seek(0)
            kmeans_size = kmeans_buffer.tell()
            
            # 如果 PNG 太大，使用 JPEG 压缩
            if kmeans_size > 400 * 1024:
                kmeans_buffer = io.BytesIO()
                quality = 95
                min_quality = 30
                quality_step = 5
                
                while quality >= min_quality:
                    kmeans_buffer = io.BytesIO()
                    kmeans_image.save(kmeans_buffer, format='JPEG', quality=quality, optimize=True)
                    kmeans_buffer.seek(0)
                    kmeans_size = kmeans_buffer.tell()
                    
                    if kmeans_size <= 400 * 1024:
                        break
                    
                    quality -= quality_step
                
                # 如果仍然太大，缩小尺寸
                if kmeans_size > 400 * 1024:
                    scale_factor = (400 * 1024 / kmeans_size) ** 0.5
                    new_width = int(kmeans_image.width * scale_factor)
                    new_height = int(kmeans_image.height * scale_factor)
                    if new_width < 100:
                        new_width = 100
                    if new_height < 100:
                        new_height = 100
                    
                    kmeans_image = kmeans_image.resize((new_width, new_height), Image.LANCZOS)
                    kmeans_buffer = io.BytesIO()
                    kmeans_image.save(kmeans_buffer, format='JPEG', quality=min_quality, optimize=True)
                    kmeans_buffer.seek(0)
                
                image_field.save(f'{filename_prefix}.jpg', ContentFile(kmeans_buffer.getvalue(), name=f'{filename_prefix}.jpg'))
            else:
                kmeans_buffer.seek(0)
                image_field.save(f'{filename_prefix}.png', ContentFile(kmeans_buffer.getvalue(), name=f'{filename_prefix}.png'))
        
        # 保存8色K-means图片到 kmeans_segmentation_image 字段
        save_kmeans_image_from_base64(kmeans_result_8['segmented_image'], result_obj.kmeans_segmentation_image, 'kmeans_8')
        
        # 进度：8色图片保存完成 (92%)
        if progress_callback:
            progress_callback(92)
        
        # 先刷新对象以验证所有图片字段都已正确保存
        result_obj.refresh_from_db()
        logger.info(f"[analyze_image_simplified_from_url] 刷新后验证 - step2_grayscale: {result_obj.step2_grayscale.name if result_obj.step2_grayscale else 'None'}, step3_lab_l: {result_obj.step3_lab_l.name if result_obj.step3_lab_l else 'None'}")
        
        # 保存结构化数据到 comprehensive_analysis（只包含数据，图片已保存到ImageField字段）
        # 注意：必须在 refresh_from_db() 之后设置，否则会被覆盖
        comprehensive_data = {
            'step1': {},  # 图片已保存到字段
            'step2': {},  # 图片已保存到字段
            'step3': {},  # 图片已保存到字段
            'step4': {
                'hue_histogram': hist.tolist(),  # 只保存直方图数据
            },
            'step5': {
                # 图片已保存到ImageField字段，不保存在JSON中
                'dominant_palette_8': {
                    'palette': dominant_palette_8['palette'],
                    'palette_ratios': dominant_palette_8['palette_ratios'],
                },
            },
        }
        logger.info(f"[analyze_image_simplified_from_url] 准备保存 comprehensive_analysis，hue_histogram长度: {len(hist)}, dominant_palette_8长度: {len(dominant_palette_8.get('palette', []))}")
        
        # 设置 comprehensive_analysis
        result_obj.comprehensive_analysis = comprehensive_data
        
        # 最后保存一次，确保所有字段都已更新（包括 comprehensive_analysis）
        result_obj.save()
        
        # 进度：完成 (100%)
        if progress_callback:
            progress_callback(100)
        
        logger.info(f"[analyze_image_simplified_from_url] 所有图片和结构化数据已保存，结果ID: {result_id}")
        logger.info(f"[analyze_image_simplified_from_url] comprehensive_analysis内容: step4.hue_histogram长度={len(result_obj.comprehensive_analysis.get('step4', {}).get('hue_histogram', []))}, step5.dominant_palette_8存在={bool(result_obj.comprehensive_analysis.get('step5', {}).get('dominant_palette_8'))}")
        
    except Exception as e:
        logger.error(f"[analyze_image_simplified_from_url] 处理图片时发生错误: {str(e)}", exc_info=True)
        raise
    finally:
        # 显式释放大数组内存（帮助GC回收）
        del rgb_image
        gc.collect()


# 保持向后兼容（如果需要）
def analyze_image_comprehensive(image_data: str) -> Dict[str, Any]:
    """
    综合图像分析（已废弃，使用analyze_image_simplified代替）
    """
    return analyze_image_simplified(image_data)

