"""Create deterministic screenshot fixtures and an independent category/title oracle.

Run with py -3.13; all generated files stay under this project's data/supervision.
These are synthetic fixtures, not evidence of accuracy on the user's real screenshots.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / '监督测试截图'
MANIFEST = ROOT / 'data' / 'supervision' / 'manifest.json'
FONT = Path('C:/Windows/Fonts/msyh.ttc')
MONO = Path('C:/Windows/Fonts/consola.ttf')

CASES = [
    ('study_math', '学习资料', '高等数学 · 复习笔记', ['第三章 导数与微分', '函数在某点的导数表示该点的瞬时变化率。', '练习：求 f(x)=x²+3x 的导数。', '解：f\'(x)=2x+3'], ['导数', '微分', '数学']),
    ('study_physics', '学习资料', '大学物理 · 课堂课件', ['第六讲：牛顿运动定律', 'F = m a', '质量为 2 kg 的物体受到 10 N 的力。', '忽略摩擦，求加速度。'], ['牛顿', '物理', '加速度', '运动']),
    ('study_english', '学习资料', 'English Vocabulary Review', ['Unit 5: Environment', 'renewable energy / biodiversity / pollution', 'Exercise: Fill in the missing words.', 'Homework: review vocabulary for tomorrow\'s quiz.'], ['英语', '词汇', '环境', 'English', 'Vocabulary']),
    ('study_history', '学习资料', '中国近代史 · 阅读资料', ['清末新政与辛亥革命', '课堂讨论：政治制度改革的背景与影响。', '阅读任务：比较各阶段的改革措施。', '思考题：革命与改革的关系。'], ['历史', '新政', '辛亥', '近代史']),
    ('code_python', '代码与报错', 'Terminal — Python', ['Traceback (most recent call last):', '  File "main.py", line 2, in <module>', '    import pandas', "ModuleNotFoundError: No module named 'pandas'"], ['Python', 'pandas', '模块', '报错', '安装']),
    ('code_node', '代码与报错', 'PowerShell — npm run dev', ['Error: listen EADDRINUSE: address already in use 127.0.0.1:5173', '    at Server.setupListenHandle (node:net:1908:16)', 'npm ERR! code 1', 'Process exited with code 1.'], ['端口', '占用', '5173', 'EADDRINUSE', 'Node', 'npm']),
    ('code_typescript', '代码与报错', 'VS Code — index.ts', ['const total: number = "100";', '', "error TS2322: Type 'string' is not assignable to type 'number'.", '1 error found.'], ['TypeScript', 'TS2322', '类型', '赋值', '报错']),
    ('code_git', '代码与报错', 'Terminal — Git', ['$ git status', 'On branch main', 'Changes not staged for commit:', '  modified: src/App.tsx', '', '$ git diff --stat', ' src/App.tsx | 12 ++++++------'], ['Git', '代码', '修改', '提交', '状态']),
    ('chat_friend', '聊天记录', '微信 · 张同学', ['张同学 18:32：今晚一起去食堂吗？', '我 18:33：可以，六点半北门见。', '张同学 18:34：好的，带上校园卡。', '我 18:35：收到。'], ['食堂', '约饭', '同学', '聊天', '北门']),
    ('chat_group', '聊天记录', 'QQ · 高数学习小组', ['李同学：第三题有人算出来了吗？', '王同学：我用了分部积分。', '我：我也算出了相同结果。', '李同学：谢谢，明天课堂再讨论。'], ['高数', '学习', '积分', '聊天', '小组']),
    ('chat_family', '聊天记录', '微信 · 家庭群', ['妈妈：周末回家吃饭吗？', '我：周六下午到家。', '爸爸：车票买好了吗？', '我：买好了，下午三点到站。'], ['家', '周末', '聊天', '车票']),
    ('chat_english', '聊天记录', 'Messages — Alex', ['Alex: Are we still meeting at the library?', 'Me: Yes, see you at 2 pm.', 'Alex: I will bring the notes.', 'Me: Great, thanks!'], ['图书馆', '见面', '聊天', '约', 'library', 'meeting']),
    ('order_book', '购物订单', '订单详情', ['订单号：2026100912345678', '商品：Python 编程入门（第3版）', '数量：1     实付款：¥59.00', '订单状态：已付款，待发货', '收货地址：青岛市某校园'], ['订单', 'Python', '书', '编程']),
    ('order_shoes', '购物订单', '购买记录', ['商品：轻便运动鞋 / 蓝色 / 42码', '商品金额：¥239.00', '优惠券：-¥20.00', '实付金额：¥219.00', '物流：运输中'], ['运动鞋', '鞋', '订单', '物流']),
    ('order_food', '购物订单', '外卖订单 · 午餐', ['商家：校园家常菜', '鱼香肉丝盖饭 ×1    ¥18.00', '配送费：¥2.00', '实付款：¥20.00', '订单状态：已送达'], ['外卖', '午餐', '盖饭', '订单']),
    ('order_english', '购物订单', 'Online Store — Order Confirmation', ['Order #A20261009', 'USB-C charging cable x 2', 'Subtotal: $12.00', 'Shipping: $3.00', 'Total paid: $15.00', 'Status: shipped'], ['订单', '充电', '线', 'USB', 'Order']),
    ('work_meeting', '工作文档', '项目会议纪要', ['日期：2026年10月9日', '议题：截图管理工具开发进展', '决定：优先完成分类与文件操作，再整合界面。', '负责人：开发组负责核心，测试组负责验收。', '下次会议：10月12日'], ['会议', '纪要', '项目', '截图']),
    ('work_schedule', '工作文档', '项目排期表', ['任务                  负责人       截止日期', '需求确认              产品组       10月10日', '核心开发              开发组       10月15日', '测试验收              测试组       10月18日', '发布准备              运维组       10月20日'], ['排期', '项目', '任务', '进度']),
    ('work_report', '工作文档', '部门周报', ['本周完成：客户资料整理、周报模板更新。', '进行中：下季度工作预算。', '待协调：两个部门的交付时间。', '下周计划：完成预算评审和内部汇报。'], ['周报', '部门', '工作', '汇报']),
    ('work_minutes_en', '工作文档', 'Product Team — Meeting Minutes', ['Date: October 9, 2026', 'Agenda: desktop screenshot organizer', 'Decision: finish the file engine before UI integration.', 'Action items: QA to verify rollback and data integrity.', 'Next review: October 12.'], ['会议', '纪要', '产品', 'Meeting', 'Minutes']),
    ('life_recipe', '生活其他', '家常食谱 · 番茄炒蛋', ['食材：番茄2个，鸡蛋3个，盐适量。', '1. 鸡蛋打散，番茄切块。', '2. 先炒鸡蛋，再炒番茄。', '3. 合炒两分钟，加盐后出锅。'], ['番茄', '炒蛋', '食谱', '做法']),
    ('life_trip', '生活其他', '周末出游备忘', ['周六：栈桥看海，下午逛老城区。', '周日：沿海散步，傍晚返程。', '随身物品：雨伞、饮水、充电宝。', '出门前检查天气。'], ['出游', '旅行', '周末', '青岛', '栈桥']),
    ('life_game', '生活其他', '游戏截图 · 关卡结算', ['关卡完成', '得分：12800', '用时：03:42', '奖励：金币 × 500', '下一关：森林冒险'], ['游戏', '关卡', '得分', '结算']),
]

def font(size: int, mono: bool = False):
    return ImageFont.truetype(str(MONO if mono else FONT), size)

def create_text_image(case, index: int) -> dict:
    key, category, heading, lines, keywords = case
    long = key == 'study_history'
    width, height = (1050, 4200) if long else (1100, 720)
    dark = category == '代码与报错'
    bg = '#1e222b' if dark else '#f4f6fa'
    foreground = '#e6edf5' if dark else '#253047'
    image = Image.new('RGB', (width, height), bg)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width, 42), fill='#27354d')
    draw.text((18, 8), 'Windows Desktop', font=font(19), fill='white')
    draw.text((width - 170, 8), '2026-10-09', font=font(19), fill='white')
    draw.rounded_rectangle((28, 65, width-28, height-30), radius=14, fill='#151923' if dark else 'white')
    draw.text((56, 93), heading, font=font(32), fill=foreground)
    draw.line((56, 148, width-56, 148), fill='#7487a0', width=2)
    y = 185
    for line in lines:
        # Measured text stays inside the fixture; long terminal lines are wrapped.
        remainder = line
        chunks = []
        while remainder:
            fit = len(remainder)
            while fit > 1 and draw.textlength(remainder[:fit], font=font(25)) > width-120:
                fit -= 1
            chunks.append(remainder[:fit])
            remainder = remainder[fit:]
        for chunk in chunks or ['']:
            draw.text((56, y), chunk, font=font(25), fill=foreground)
            y += 43
        y += 8
    if long:
        for n in range(1, 55):
            draw.text((56, y), f'阅读笔记 {n}：记录改革背景，梳理时间线与核心概念。', font=font(24), fill=foreground)
            y += 59
    suffix = ['.png', '.jpg', '.webp', '.bmp'][index % 4]
    path = OUT / f'{index+1:02d}_{key}{suffix}'
    image.save(path)
    return {'id': key, 'file': str(path.relative_to(ROOT)), 'expectedCategoryName': category,
            'acceptableTitleKeywords': keywords, 'expectNeedsReview': False, 'kind': 'synthetic-clear',
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = [create_text_image(case, i) for i, case in enumerate(CASES)]
    image = Image.new('RGB', (1000, 700), '#8bc6e6')
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 400, 1000, 700), fill='#246a9a')
    draw.ellipse((400, 230, 600, 430), fill='#ffb565')
    draw.polygon([(0,420),(170,250),(360,420)], fill='#234d57')
    draw.polygon([(650,420),(820,200),(1000,420)], fill='#32646b')
    draw.ellipse((420,450,580,468), fill='#ffd292')
    path = OUT / '24_life_sunset.png'
    image.save(path)
    manifest.append({'id':'life_sunset','file':str(path.relative_to(ROOT)), 'expectedCategoryName':'生活其他',
                     'acceptableTitleKeywords':['夕阳','日落','风景','湖','海','山','太阳'],
                     'expectNeedsReview':False,'kind':'synthetic-no-text',
                     'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    Image.new('RGB', (900, 600), 'white').save(OUT / 'edge_blank.png')
    Image.new('RGB', (900, 600), '#777777').save(OUT / 'edge_uniform.png')
    (OUT / 'edge_corrupt.png').write_bytes(b'\x89PNG\r\n\x1a\ninvalid truncated test image')
    (OUT / 'edge_unsupported.txt').write_text('not an image', encoding='utf-8')
    payload = {'schemaVersion':1,'datasetKind':'synthetic','clearCases':manifest,
               'edgeCases':[
                   {'file':str((OUT/'edge_blank.png').relative_to(ROOT)),'expected':'review-required'},
                   {'file':str((OUT/'edge_uniform.png').relative_to(ROOT)),'expected':'review-required'},
                   {'file':str((OUT/'edge_corrupt.png').relative_to(ROOT)),'expected':'isolated-failure'},
                   {'file':str((OUT/'edge_unsupported.txt').relative_to(ROOT)),'expected':'not-scanned'}],
               'note':'合成数据可复现；不代表真实用户截图准确率。标题关键词是初筛，最终仍需核对描述是否忠实。'}
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'clearCases':len(manifest),'edgeCases':4,'manifest':str(MANIFEST)},ensure_ascii=False))

if __name__ == '__main__':
    main()
