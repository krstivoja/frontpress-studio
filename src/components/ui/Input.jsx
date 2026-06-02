import { forwardRef } from 'react';

// Mirrors dsystem `.form-input` — 36px tall, 13px text, 6px radius, soft black
// focus ring (rgba(9,9,11,.12) ≈ ring-zinc-900/15).
//
// Sizing intentionally lives outside the base: Tailwind v4 emits utilities in
// source-scan order, and a baked-in `w-full` can end up later in the cascade
// than a caller's `w-36` / `w-56`, silently winning and stretching toolbar
// controls. The component picks `w-full` only when the caller hasn't supplied
// their own width class.
// Hover state: subtle border darkening + soft shadow so unfocused
// controls visibly respond to the cursor without competing with the
// focus state's chunky ring. transition-colors → transition so the
// shadow animates in as smoothly as the border colour does.
export const baseControlCls =
  'flex h-9 rounded-md border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 transition hover:border-zinc-300 hover:shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 disabled:hover:border-zinc-200 disabled:hover:shadow-none';

const widthClassRE = /(^|\s)(w-|min-w-|max-w-)/;
export const hasWidthClass = (cls) => widthClassRE.test(cls || '');

const Input = forwardRef(function Input(
  { className = '', mono = false, ...rest },
  ref
) {
  const width = hasWidthClass(className) ? '' : 'w-full';
  return (
    <input
      ref={ref}
      className={`${baseControlCls} ${width} ${mono ? 'font-mono text-xs' : ''} ${className}`}
      {...rest}
    />
  );
});

export default Input;
