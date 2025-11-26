"""
类型转换工具函数
用于处理从数据库读取时可能出现的类型不一致问题（特别是从 SQLite 迁移到 MySQL 后）
"""


def to_int(value, default=0):
    """安全转换为整数"""
    if value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))  # 先转 float 再转 int，处理 "1.0" 这种情况
        except (ValueError, TypeError):
            return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def to_float(value, default=0.0):
    """安全转换为浮点数"""
    if value is None:
        return default
    if isinstance(value, float):
        return value
    if isinstance(value, int):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except (ValueError, TypeError):
            return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def safe_max(*args, default=0):
    """安全的最大值比较，自动转换类型"""
    if not args:
        return default
    
    # 尝试转换为数字
    converted = []
    for arg in args:
        if arg is None:
            continue
        if isinstance(arg, (int, float)):
            converted.append(arg)
        elif isinstance(arg, str):
            try:
                # 尝试转换为数字
                if '.' in arg:
                    converted.append(float(arg))
                else:
                    converted.append(int(arg))
            except (ValueError, TypeError):
                continue
        else:
            try:
                converted.append(float(arg))
            except (ValueError, TypeError):
                continue
    
    if not converted:
        return default
    
    return max(converted)


def safe_min(*args, default=0):
    """安全的最小值比较，自动转换类型"""
    if not args:
        return default
    
    # 尝试转换为数字
    converted = []
    for arg in args:
        if arg is None:
            continue
        if isinstance(arg, (int, float)):
            converted.append(arg)
        elif isinstance(arg, str):
            try:
                # 尝试转换为数字
                if '.' in arg:
                    converted.append(float(arg))
                else:
                    converted.append(int(arg))
            except (ValueError, TypeError):
                continue
        else:
            try:
                converted.append(float(arg))
            except (ValueError, TypeError):
                continue
    
    if not converted:
        return default
    
    return min(converted)








