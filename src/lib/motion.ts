/**
 * 入场动画的弹簧参数。
 *
 * 阻尼必须 ≥ 2√stiffness（临界阻尼），否则弹簧会**过冲** ——
 * 元素先冲过目标位置、再荡回来、再冲过去，观感就是「来回抽动」。
 *
 * 本项目原先在各处手写成 `damping: 16~20`，实际阻尼比 ζ = d/(2√k)
 * 只有 0.52~0.75，于是全项目的入场动画都在抖。
 * 这里统一按 ζ=1 推导，不再手调：k=150→25、200→29、250→32、300→35。
 *
 * 不适用于交互类动画（鼠标跟随、按压反馈）—— 那些地方的回弹是刻意的
 * 手感设计，见 TiltCard 的 3D 跟随弹簧。
 */
export function entrySpring(stiffness: number) {
  return {
    type: 'spring' as const,
    stiffness,
    damping: Math.ceil(2 * Math.sqrt(stiffness)),
  };
}
