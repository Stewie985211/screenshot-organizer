export const categories = [
  { id: 'study', name: '学习资料', description: '课程、笔记、题目、学习教程、考试与知识资料', enabled: true, icon: 'book', color: '#8870BF', tint: '#F0EBF7' },
  { id: 'code', name: '代码与报错', description: '程序代码、终端报错、软件配置与技术排障', enabled: true, icon: 'code', color: '#5483B9', tint: '#EAF1FA' },
  { id: 'chat', name: '聊天记录', description: '即时通信、私信和对话消息', enabled: true, icon: 'chat', color: '#4D957C', tint: '#EAF5EF' },
  { id: 'shopping', name: '购物订单', description: '商品、价格、购物订单、物流与付款凭证', enabled: true, icon: 'bag', color: '#BD7D61', tint: '#FCF0E9' },
  { id: 'work', name: '工作文档', description: '工作通知、会议、任务安排、办公文件与表格', enabled: true, icon: 'work', color: '#697F9B', tint: '#EDF0F5' },
  { id: 'life', name: '生活其他', description: '旅行、饮食、游戏、日常生活及其他可辨认内容', enabled: true, icon: 'sun', color: '#B09149', tint: '#F7F2E6' },
];

const text = (x, y, content, size = 15, fill = '#343A4D', weight = 400, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${content}</text>`;
const rect = (x, y, w, h, fill, r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${r}"/>`;
const line = (x, y, w, fill = '#E9ECF2') => `<path d="M${x} ${y}h${w}" stroke="${fill}"/>`;
const dots = ['#E49795','#DFBF75','#8EBBA2'].map((c,i) => `<circle cx="${17+i*14}" cy="15" r="3.5" fill="${c}"/>`).join('');
function svg(content, {bg = '#FFFFFF', height = 320, chrome = true} = {}) {
  const data = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="${height}" viewBox="0 0 500 ${height}" font-family="Segoe UI, Microsoft YaHei, sans-serif">${rect(0,0,500,height,bg)}${chrome ? `${rect(0,0,500,30,bg === '#202535' ? '#171B27' : '#EFF1F5')}${dots}` : ''}${content}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
}

const previews = {
  terminal: svg(
    `${text(72,20,'Terminal — Python',10,'#9DA7BF')}${text(24,63,'PS D:\\Projects\\analysis&gt; python main.py',13,'#CBD3E5')}${text(24,104,'Traceback (most recent call last):',14,'#E2A392')}${text(40,135,'File “main.py”, line 2, in &lt;module&gt;',13,'#CFD5E2')}${text(54,166,'import pandas as pd',14,'#CAD9EE')}${rect(20,190,460,39,'#3C2937',5)}${text(30,215,'ModuleNotFoundError: No module named ‘pandas’',12,'#F2ACAF')}${text(24,260,'PS D:\\Projects\\analysis&gt;',13,'#80BCB0')}${rect(254,250,7,17,'#AAB7C8')}`,
    {bg:'#202535'}),
  calculus: svg(`${text(29,70,'MATHEMATICS',10,'#9584B4',600,'letter-spacing="2"')}${text(29,103,'第三章 · 导数与微分',26,'#383448',600)}${line(29,123,442)}${text(29,155,'3.1  函数的瞬时变化率',15,'#555266',600)}${text(29,184,'导数描述函数在某一点附近的变化。',13,'#7A7689')}${rect(29,205,440,70,'#F4F0FA',5)}${text(49,247,'f(x) = x² + 3x     →     f′(x) = 2x + 3',21,'#6E588D')}${text(29,301,'例题 01    求曲线在 x = 2 处的切线方程。',12,'#797583')}`),
  chat: svg(`${text(75,21,'微信',10,'#7A8491')}${rect(0,30,96,290,'#E9ECEF')}${rect(15,49,30,30,'#64A586',7)}${text(24,69,'林',15,'#FFFFFF')}${rect(12,97,73,36,'#D9DEDF',4)}${text(24,120,'林同学',12)}${text(122,61,'林同学',18,'#333A3F',600)}${line(111,77,378,'#DEE3E7')}${text(278,99,'18:32',10,'#9AA4AD')}${rect(120,115,230,44,'#FFFFFF',6)}${text(132,142,'今晚一起去食堂吗？',15,'#46505A')}${rect(224,183,248,54,'#BFE2A3',6)}${text(237,215,'好呀，六点半北门见。',15,'#35542F')}${rect(120,261,234,40,'#FFFFFF',6)}${text(133,286,'记得带上校园卡。',14,'#46505A')}`,{bg:'#F1F3F4'}),
  order: svg(`${text(75,21,'订单详情',10,'#7A8491')}${rect(0,30,500,61,'#FAEEE8')}${text(25,65,'等待卖家发货',21,'#AB644A',600)}${rect(25,112,75,96,'#EADED1',4)}${rect(35,119,55,82,'#525967',2)}${text(44,147,'PYTHON',9,'#F1C077',600)}${text(43,167,'编程入门',8,'#FFFFFF')}${text(121,133,'Python 编程入门（第 3 版）',17,'#3D3B3A',600)}${text(121,162,'纸质书 / 正版 / 单本',12,'#99918D')}${text(121,193,'¥59.00',23,'#AE6C51',600)}${line(25,226,450)}${text(25,254,'商品金额',13,'#87807C')}${text(411,254,'¥59.00',13)}${text(25,288,'实付款',13,'#87807C')}${text(400,288,'¥59.00',17,'#AE6C51',600)}`),
  meeting: svg(`${text(72,20,'会议纪要 / 截图整理助手',10,'#7A8491')}${text(32,75,'产品开发会议纪要',25,'#353E4C',600)}${text(32,104,'2026 年 10 月 9 日  ·  开发组',12,'#959CAA')}${line(32,124,436)}${text(32,158,'本次决定',16,'#48566C',600)}${text(32,189,'优先完成分类与文件操作，再整合界面。',14,'#6E7888')}${rect(32,212,436,73,'#EDF3F8',5)}${rect(32,212,4,73,'#7697B4')}${text(52,239,'待办事项',12,'#6A89A4',600)}${text(52,263,'核心开发 → 分类、重命名、移动与撤销',13,'#4C647C')}`),
  seaside: svg(`<defs><linearGradient id="sea" x2="0" y2="1"><stop stop-color="#A0C7DE"/><stop offset="1" stop-color="#DCEDF3"/></linearGradient></defs>${rect(0,0,500,320,'url(#sea)')}${rect(0,155,500,165,'#77A9BC')}<path d="M0 220Q100 180 190 227T500 200V320H0Z" fill="#B1CDD0"/><path d="M0 250Q100 228 230 271T500 265V320H0Z" fill="#E8DBC6"/><path d="M0 245Q100 225 230 269T500 257" fill="none" stroke="#EFF6F3" stroke-width="5"/><path d="m286 185 148-82 20 6-155 84Z" fill="#718B96"/><path d="m430 72 23 0-2 27h-19Z" fill="#556D77"/><path d="m425 73 18-14 16 14Z" fill="#7E6260"/><path d="M110 149q5-7 10 0m8-8q5-7 10 0" fill="none" stroke="#617B88" stroke-width="2"/>${rect(18,18,110,29,'#FFFFFF',7)}${text(30,38,'青岛 · 栈桥',13,'#466A7B',600)}${text(25,292,'周末的海边',21,'#67766F',500)}`,{chrome:false}),
  vocab: svg(`${text(72,20,'English / Unit 5',10,'#7A8491')}${text(30,72,'A little English, every day.',24,'#526450',600)}${text(30,99,'UNIT 05 · ENVIRONMENT',10,'#869782',500,'letter-spacing="2"')}${line(30,121,440)}${text(30,160,'renewable energy',21,'#54765B',600)}${text(30,185,'可再生能源',13,'#8A938A')}${line(30,205,440)}${text(30,239,'biodiversity',21,'#54765B',600)}${text(30,265,'生物多样性',13,'#8A938A')}${rect(330,150,135,33,'#F0F5ED',16)}${text(345,171,'/rɪˈnjuːəbl/',13,'#798D70')}`),
  schedule: svg(`${text(72,20,'项目 / 排期表',10,'#7A8491')}${text(28,75,'十月项目排期',25,'#394454',600)}${text(28,105,'从核心功能到最终交付',12,'#9BA2AE')}${rect(25,130,450,35,'#ECF0F6',4)}${text(39,153,'任务',12,'#78859B',600)}${text(255,153,'负责人',12,'#78859B',600)}${text(375,153,'截止日期',12,'#78859B',600)}${['需求确认','核心开发','测试验收','发布准备'].map((t,i)=>`${text(39,191+i*36,t,13,'#59657A')}${text(255,191+i*36,['产品组','开发组','测试组','运维组'][i],12,'#8A95A5')}${text(375,191+i*36,['10 / 10','10 / 15','10 / 18','10 / 20'][i],12,'#697890')}${line(25,204+i*36,450)}`).join('')}`),
  recipe: svg(`${rect(0,30,170,290,'#F4EEDD')}${text(22,86,'一日食记',22,'#9B8A62',600)}${text(22,116,'今天吃什么',12,'#AA9A7B')}<circle cx="85" cy="220" r="58" fill="#FCFAF1"/><circle cx="85" cy="220" r="45" fill="#D8B36A"/><path d="m58 194 31 10-8 26-30-13Zm28 40 20-34 17 25-15 26Z" fill="#C77659"/>${text(198,77,'番茄炒蛋',27,'#655841',600)}${text(198,108,'15 分钟 · 两人份',12,'#A29887')}${line(198,133,274,'#E9E4D8')}${text(198,165,'食材',14,'#827257',600)}${text(198,195,'番茄 2 个 / 鸡蛋 3 个',13,'#8B8172')}${text(198,227,'做法',14,'#827257',600)}${text(198,257,'先炒鸡蛋，再炒番茄。',13,'#8B8172')}${text(198,284,'合炒两分钟，加盐后出锅。',13,'#8B8172')}`),
  git: svg(`${text(72,20,'VS Code — source control',10,'#9CA7C0')}${rect(0,30,42,290,'#191D2A')}${text(65,72,'$ git status',16,'#89BBA5')}${text(65,111,'On branch main',14,'#C1C9DA')}${text(65,144,'Changes not staged for commit:',14,'#C1C9DA')}${text(86,180,'modified:   src/App.tsx',14,'#E6B17F')}${line(65,211,410,'#353B4A')}${text(65,243,'$ git diff --stat',15,'#89BBA5')}${text(65,280,'src/App.tsx | 12 ++++++------',14,'#C1C9DA')}`,{bg:'#252A39'}),
  long: svg(`${text(32,73,'中国近代史 · 阅读笔记',25,'#5D4D72',600)}${text(32,105,'清末新政与辛亥革命',15,'#8A789E')}${line(32,128,436)}${Array.from({length:16},(_,i)=>`${text(32,167+i*43,`${i+1}. ${['梳理制度改革的背景与影响','比较各阶段改革的具体措施','记录历史事件之间的关系'][i%3]}`,14,'#7F748D')}${line(32,181+i*43,420,'#F0ECF4')}`).join('')}`,{height:920}),
  blank: svg(`${rect(0,0,500,320,'#E1E3E8')}${text(187,167,'内容待确认',20,'#A4A8B2')}`,{chrome:false}),
  pending: svg(`${text(72,20,'便签 · 今日安排',10,'#7A8491')}${text(35,78,'明天要记得',25,'#52615B',600)}${['打印课件','检查课程通知','整理桌面截图'].map((t,i)=>`${rect(35,112+i*48,17,17,'#EEF4EE',3)}${text(68,128+i*48,t,16,'#7C8A80')}`).join('')}`),
};

function image(id, kind, title, categoryId, status = 'ready', yesterday = false) {
  const index = Number(id.slice(4));
  const originalName = `Screenshot_2026${yesterday ? '1008' : '1009'}_${String(143200+index*103).padStart(6,'0')}.png`;
  return {
    id, originalName,
    path: `D:\\Pictures\\Screenshots\\${originalName}`,
    hash: `demo-hash-${id}`, bytes: 140200 + index*49270,
    mtimeMs: Date.parse(`2026-10-${yesterday ? '08' : '09'}T${String(15-index%5).padStart(2,'0')}:${String(20+index%20).padStart(2,'0')}:00+08:00`),
    width: kind === 'long' ? 1080 : 1920, height: kind === 'long' ? 5980 : 1080,
    status, preview: previews[kind], kind,
    analysis: status === 'pending' || status === 'error' ? undefined : { categoryId, title, summary: summaries[kind] || '图片内容不够清晰，请对照原图确认分类与标题。', needsReview: status === 'review' },
    error: status === 'error' ? '图片无法解码，文件可能已损坏。请检查原文件后重新扫描。' : undefined,
  };
}
const summaries = {
  terminal:'Python 运行时提示缺少 pandas 模块，需要检查当前环境中的依赖安装。',
  calculus:'高等数学第三章的导数定义、求导示例与切线练习。',
  chat:'与同学约定晚上六点半在北门见面，一起去食堂吃饭。',
  order:'Python 编程入门书籍订单，实付款 59 元，等待卖家发货。',
  meeting:'截图整理工具的产品会议记录，决定先完成核心功能再整合界面。',
  seaside:'青岛栈桥的海边风景与周末旅行记录。',
  vocab:'环境主题英语词汇：可再生能源与生物多样性。',
  schedule:'十月项目的需求、开发、测试和发布排期及负责人。',
  recipe:'番茄炒蛋的食材用量与烹饪步骤。',
  git:'Git 工作区状态及 App.tsx 文件的修改统计。',
  long:'中国近代史课堂阅读笔记，包含清末新政与辛亥革命。',
};

export const initialImages = [
  image('img-1','terminal','Python 缺少 pandas 模块报错','code'),
  image('img-2','calculus','高等数学导数与微分复习笔记','study'),
  image('img-3','chat','与同学约定北门见面吃晚饭','chat'),
  image('img-4','order','Python 编程入门书籍购买订单','shopping'),
  image('img-5','meeting','截图整理工具产品开发会议纪要','work'),
  image('img-6','seaside','青岛栈桥周末海边风景','life'),
  image('img-7','vocab','环境主题英语词汇复习','study','ready',true),
  image('img-8','schedule','十月项目开发与测试排期','work','ready',true),
  image('img-9','recipe','番茄炒蛋食材与烹饪步骤','life','ready',true),
  image('img-10','git','Git 工作区修改状态与差异统计','code','ready',true),
  image('img-11','long','近代史课堂笔记（待核对）','study','review',true),
  image('img-12','blank','内容待确认','life','review',true),
  image('img-13','pending','',undefined,'pending',true),
  {...image('img-14','blank','',undefined,'error',true), preview:undefined, originalName:'Screenshot_20261008_101402.png'},
];

export const initialSettings = {
  sourceFolders: ['D:\\Pictures\\Screenshots'], recursive:true,
  outputFolder:'D:\\Projects\\ScreenshotOrganizer\\output\\整理后的截图',
  categories, model:'qwen3-vl:4b-instruct', recognitionTimeoutMs:180000,
};

export const initialHistory = [{
  id:'demo-batch-1', createdAt:'2026-10-08T09:46:00+08:00', planId:'demo-plan-1', kind:'organize',
  records: ['高等数学课堂练习','TypeScript 类型赋值报错','周末行程安排'].map((title,i)=>({
    id:`demo-record-${i}`, batchId:'demo-batch-1', stage:'committed', targetOwned:true, direction:'forward',
    item:{imageId:`historical-${i}`,categoryId:['study','code','life'][i],title,source:`D:\\Pictures\\Screenshots\\Screenshot_20261008_09${i}120.png`,target:`${initialSettings.outputFolder}\\${categories.find(c=>c.id===['study','code','life'][i]).name}\\2026-10-08_${title}.png`},
  })),
}];

export const recoveryExample = {
  id:'demo-recovery-1', direction:'forward', stage:'verified',
  item:{source:'D:\\Pictures\\Screenshots\\Screenshot_20261008_091208.png',target:`${initialSettings.outputFolder}\\学习资料\\2026-10-08_高等数学课堂练习.png`,title:'高等数学课堂练习'},
};
