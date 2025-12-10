import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, '../..');
const sourceImage = join(rootDir, 'EchoDraw.png');
const publicDir = join(__dirname, '../public');

// 检查源图片是否存在
if (!existsSync(sourceImage)) {
  console.error(`错误: 找不到源图片 ${sourceImage}`);
  process.exit(1);
}

// 生成图标
async function generateIcons() {
  try {
    console.log('正在生成 PWA 图标...');
    
    // 生成 192x192 图标
    await sharp(sourceImage)
      .resize(192, 192, {
        fit: 'contain',
        background: { r: 34, g: 27, b: 27, alpha: 1 } // 使用主题色 #221b1b 作为背景
      })
      .png()
      .toFile(join(publicDir, 'icon-192.png'));
    
    console.log('✓ 已生成 icon-192.png');
    
    // 生成 512x512 图标
    await sharp(sourceImage)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 34, g: 27, b: 27, alpha: 1 } // 使用主题色 #221b1b 作为背景
      })
      .png()
      .toFile(join(publicDir, 'icon-512.png'));
    
    console.log('✓ 已生成 icon-512.png');
    
    console.log('图标生成完成！');
  } catch (error) {
    console.error('生成图标时出错:', error);
    process.exit(1);
  }
}

generateIcons();

