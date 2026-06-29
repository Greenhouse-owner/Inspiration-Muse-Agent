import type { SVGProps } from 'react';

export type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

const baseProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconBook({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4 6 v12 h16 v-12" />
      <path d="M4 6 Q8 3 12 6 Q16 3 20 6" />
      <path d="M12 6 v12" />
    </svg>
  );
}

export function IconCharacter({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 20 v-1.5 a4 4 0 0 1 4 -4 h4 a4 4 0 0 1 4 4" />
      <path d="M14.5 19.5 l5 -5 l1.5 1.5 l-5 5 z" />
      <path d="M14.5 19.5 l-0.6 2.1 l2.1 -0.6" />
    </svg>
  );
}

export function IconGlobe({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

export function IconArrowUpRight({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="9 7 17 7 17 15" />
    </svg>
  );
}

export function IconRefresh({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M21 4 v5 h-5" />
      <path d="M3 20 v-5 h5" />
      <path d="M20 9 a9 9 0 0 0 -16.5 -2" />
      <path d="M4 15 a9 9 0 0 0 16.5 2" />
    </svg>
  );
}

export function IconTap({ size = 16, ...rest }: IconProps) {
  // 来自示例图 finger-click.svg —— 一只竖起的手指做点击动作
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M6 6.5C6 4.01472 8.01472 2 10.5 2C12.9853 2 15 4.01472 15 6.5M12 11.3333V6.50001C12 5.67158 11.3285 5 10.5 5C9.6716 5 9.00003 5.67158 9.00003 6.50001V15.9412L7.08296 14.7007C6.47076 14.3046 5.65715 14.4437 5.2113 15.0207C4.79881 15.5545 4.82481 16.3063 5.27317 16.8104L9.00003 21H17C17.1588 19.5709 17.4433 17.16 17.6684 15.2701C17.8544 13.7081 16.8042 12.2675 15.2601 11.9672L12 11.3333Z" />
    </svg>
  );
}
