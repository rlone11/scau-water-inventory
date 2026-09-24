/**
 * 设置页的选项清单（⚠️ 全是假的，这是个彩蛋）
 *
 * 这个页面故意做得像模像样：分组、说明文字、开关、下拉、滑块一应俱全，
 * 但**除了最底下那个「退出登录」，其他所有控件点了都只弹一句玩笑话**。
 *
 * 为什么单独放一个文件：页面组件只管渲染，清单只管数据。
 * 以后想加一条"看着很有用"的选项，改这里就行，不用碰页面代码。
 *
 * 控件的取值都写死成"出厂默认的样子" —— 因为根本存不下来，
 * 也不该存。点了会弹窗，弹完控件纹丝不动（交互全被 pointerEvents 挡住，
 * 见 SettingsPage 里的说明）。
 */

/** 假控件的四种长相 —— 覆盖设置页里最常见的那几款 */
export type FakeControl =
  | { kind: 'switch'; default: boolean }
  | { kind: 'select'; default: string; options: string[] }
  | { kind: 'segmented'; default: string; options: string[] }
  | { kind: 'slider'; default: number; min: number; max: number; unit?: string };

export interface FakeSetting {
  id: string;
  label: string;
  /** 一句话说明——要写得像那么回事，越正经越好笑 */
  hint: string;
  control: FakeControl;
}

export interface SettingGroup {
  key: string;
  title: string;
  items: FakeSetting[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    key: 'appearance',
    title: '外观',
    items: [
      {
        id: 'theme',
        label: '主题配色',
        hint: '换个颜色换个心情',
        control: { kind: 'select', default: '水院蓝', options: ['水院蓝', '青柠黄', '暗夜黑', '护眼绿'] },
      },
      {
        id: 'dark',
        label: '深色模式',
        hint: '夜里看屏幕不刺眼',
        control: { kind: 'switch', default: false },
      },
      {
        id: 'density',
        label: '列表密度',
        hint: '一屏能塞下多少条',
        control: { kind: 'segmented', default: '舒适', options: ['紧凑', '舒适', '宽松'] },
      },
      {
        id: 'radius',
        label: '卡片圆角',
        hint: '边角有多圆',
        control: { kind: 'slider', default: 60, min: 0, max: 100, unit: '%' },
      },
      {
        id: 'fontScale',
        label: '字号缩放',
        hint: '整体放大或缩小',
        control: { kind: 'slider', default: 100, min: 80, max: 130, unit: '%' },
      },
    ],
  },
  {
    key: 'motion',
    title: '动画与特效',
    items: [
      {
        id: 'intro',
        label: '开场动画',
        hint: '水滴汇聚成院徽那一段',
        control: { kind: 'switch', default: true },
      },
      {
        id: 'water',
        label: '背景水波',
        hint: '页面底层流动的粒子',
        control: { kind: 'switch', default: true },
      },
      {
        id: 'cursor',
        label: '鼠标特效',
        hint: '点击时溅起的水花',
        control: { kind: 'switch', default: true },
      },
      {
        id: 'tilt',
        label: '卡片 3D 跟随',
        hint: '鼠标移上去卡片会跟着转',
        control: { kind: 'switch', default: true },
      },
      {
        id: 'countUp',
        label: '数字滚动',
        hint: '统计数字从 0 涨上去',
        control: { kind: 'switch', default: true },
      },
      {
        id: 'pageTransition',
        label: '页面转场',
        hint: '切换页面时的过渡效果',
        control: { kind: 'segmented', default: '标准', options: ['关闭', '标准', '丝滑'] },
      },
    ],
  },
  {
    key: 'data',
    title: '数据与加载',
    items: [
      {
        id: 'pageSize',
        label: '每页显示条数',
        hint: '列表一页放多少条',
        control: { kind: 'select', default: '20', options: ['10', '20', '50', '100'] },
      },
      {
        id: 'sort',
        label: '默认排序方式',
        hint: '打开列表时按什么排',
        control: {
          kind: 'select',
          default: '最近录入',
          options: ['最近录入', '名称', '编号', '库存从多到少', '库存从少到多'],
        },
      },
      {
        id: 'cacheTtl',
        label: '本地缓存时长',
        hint: '缓存越久越流畅，代价是数据越旧',
        control: { kind: 'select', default: '30 秒', options: ['关闭', '30 秒', '1 分钟', '5 分钟', '30 分钟'] },
      },
      {
        id: 'autoRefresh',
        label: '自动刷新间隔',
        hint: '多久悄悄拉一次最新数据',
        control: { kind: 'select', default: '不自动', options: ['不自动', '1 分钟', '5 分钟', '30 分钟'] },
      },
      {
        id: 'prefetch',
        label: '预加载其他页面',
        hint: '提前把还没打开的页面下好',
        control: { kind: 'switch', default: true },
      },
    ],
  },
  {
    key: 'borrow',
    title: '借用与归还',
    items: [
      {
        id: 'defaultDays',
        label: '默认借期',
        hint: '新建借用单默认填几天',
        control: { kind: 'slider', default: 3, min: 1, max: 30, unit: ' 天' },
      },
      {
        id: 'overdueWarn',
        label: '逾期自动提醒',
        hint: '快到归还日时提醒负责人',
        control: { kind: 'switch', default: true },
      },
      {
        id: 'overdueThreshold',
        label: '逾期判定阈值',
        hint: '超期几天算逾期',
        control: { kind: 'slider', default: 1, min: 0, max: 14, unit: ' 天' },
      },
      {
        id: 'lowStock',
        label: '低库存预警',
        hint: '可借数低于多少时标红',
        control: { kind: 'slider', default: 3, min: 0, max: 20, unit: ' 件' },
      },
      {
        id: 'consumedRequired',
        label: '归还时消耗数必填',
        hint: '不填不让提交',
        control: { kind: 'switch', default: false },
      },
      {
        id: 'allowOverBorrow',
        label: '允许超借',
        hint: '借出数量可以超过库存',
        control: { kind: 'switch', default: false },
      },
    ],
  },
  {
    key: 'notify',
    title: '通知提醒',
    items: [
      {
        id: 'email',
        label: '邮件提醒',
        hint: '重要变动发到邮箱',
        control: { kind: 'switch', default: false },
      },
      {
        id: 'sms',
        label: '短信提醒',
        hint: '逾期时给负责人发短信',
        control: { kind: 'switch', default: false },
      },
      {
        id: 'wechat',
        label: '微信推送',
        hint: '推送到微信服务号',
        control: { kind: 'switch', default: false },
      },
      {
        id: 'digest',
        label: '每周汇总',
        hint: '每周一发一份使用报告',
        control: { kind: 'switch', default: false },
      },
    ],
  },
  {
    key: 'system',
    title: '系统',
    items: [
      {
        id: 'lang',
        label: '界面语言',
        hint: '换一种语言显示',
        control: { kind: 'select', default: '简体中文', options: ['简体中文', 'English', '文言文', '四川话'] },
      },
      {
        id: 'timezone',
        label: '时区',
        hint: '影响所有时间的显示',
        control: {
          kind: 'select',
          default: 'Asia/Shanghai (UTC+8)',
          options: ['Asia/Shanghai (UTC+8)', 'UTC', 'Asia/Tokyo (UTC+9)'],
        },
      },
      {
        id: 'weekStart',
        label: '每周起始日',
        hint: '统计按哪天算一周',
        control: { kind: 'segmented', default: '周一', options: ['周日', '周一'] },
      },
      {
        id: 'backup',
        label: '自动备份频率',
        hint: '多久自动存一次快照',
        control: { kind: 'select', default: '每天', options: ['不备份', '每天', '每周', '每月'] },
      },
      {
        id: 'shortcut',
        label: '自定义快捷键',
        hint: '改成你顺手的组合键',
        control: { kind: 'switch', default: false },
      },
    ],
  },
];

/** 假选项统一的那句台词 */
export const LAZY_LINES = {
  title: '没有这个选项哦',
  body: '创作者太懒了，你去催催他',
  emoji: '😴',
  floaters: ['💤', '🥱', '💤', '🛌', '💤'],
} as const;

/** 「申请管理员」单独一套台词——口气要更可怜一点 */
export const ADMIN_APPLY_LINES = {
  title: '申请管理员',
  body: '你去线下求求创作者呗',
  emoji: '🙏',
  floaters: ['🥺', '✨', '😭', '✨', '🍬'],
} as const;
