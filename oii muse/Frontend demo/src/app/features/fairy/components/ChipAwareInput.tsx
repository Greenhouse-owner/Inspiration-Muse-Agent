// ChipAwareInput —— 支持"粉色文字 tag + 自由文字"混排的输入框。
//
// 为什么不用 <input>：原生 input 不能在中间穿插不可编辑的"芯片"段落。
// 改用 contentEditable div：tag 是 contenteditable=false 的 <span>，自由文字
// 是 div 内的文本节点。
//
// 数据契约（受控组件）：
//   tags: ChipTag[]   —— 当前已加进输入框的粉色 tag 列表（外部状态机维护）
//   text: string      —— 末尾自由文字（光标默认落在这里）
//
// 简化决策：
//   tags 永远渲染在 text 之前。用户输入的所有自由字符都进 text；
//   tag 之间用 inline-block 紧贴排列，最后一个 tag 与 text 之间用  （&nbsp;）隔开。
//   这样不必重建复杂 DOM 结构，也不用解析光标位置。
//
// 三条核心行为（钉死在单元测试里）：
//   1. 同槽点击 → 父组件 togglePendingTag 用同槽覆盖语义传新数组进来
//   2. 不同槽点击 → 父组件追加新 tag
//   3. backspace 在 text 为空时 → 删掉最后一个 tag

import { useEffect, useRef } from 'react';
import { theme } from '../../../theme';

export interface ChipTag {
  field: string;
  label: string;
}

export interface ChipAwareInputProps {
  tags: ChipTag[];
  text: string;
  onTagsChange: (next: ChipTag[]) => void;
  onTextChange: (next: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChipAwareInput({
  tags, text, onTagsChange, onTextChange, onSend,
  disabled = false, placeholder,
}: ChipAwareInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // text 的真实来源是父组件 props，editor 内部仅作为输入面。
  // 我们用 ref 记录"上一次设置进 DOM 的 text"，避免 React 重渲染导致光标跳走。
  const lastTextRef = useRef<string>(text);

  // 当外部 text 与 editor 当前内容不一致时（例如父组件清空），同步进 DOM。
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.textContent !== text) {
      el.textContent = text;
      lastTextRef.current = text;
      // 把光标放到末尾
      placeCaretAtEnd(el);
    }
  }, [text]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const current = el.textContent ?? '';
    if (current !== lastTextRef.current) {
      lastTextRef.current = current;
      onTextChange(current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }
    if (e.key === 'Backspace') {
      // 文字区为空 → 删最后一个 tag
      const el = editorRef.current;
      const txt = el?.textContent ?? '';
      if (!txt && tags.length > 0) {
        e.preventDefault();
        onTagsChange(tags.slice(0, -1));
      }
    }
  };

  // 强制纯文本粘贴
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: 4,
        background: 'rgba(255,255,255,.04)',
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '6px 10px',
        minHeight: 32,
        opacity: disabled ? 0.5 : 1,
      }}
      onClick={() => editorRef.current?.focus()}
    >
      {tags.map((t, i) => (
        <span
          key={`${t.field}:${t.label}:${i}`}
          contentEditable={false}
          data-chip-field={t.field}
          data-chip-label={t.label}
          style={{
            color: theme.primary,
            fontWeight: 600,
            fontSize: 13,
            lineHeight: 1.4,
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {t.label}
        </span>
      ))}
      <div
        ref={editorRef}
        role="textbox"
        aria-label="输入框"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        data-testid="chip-aware-editor"
        style={{
          flex: 1, minWidth: 60,
          color: theme.text,
          fontSize: 13, lineHeight: 1.4,
          outline: 'none',
          // 当 text 和 tags 都为空时，用 ::before 显示 placeholder
        }}
        data-placeholder={tags.length === 0 && !text ? (placeholder ?? '') : ''}
      />
    </div>
  );
}

function placeCaretAtEnd(el: HTMLElement) {
  el.focus();
  const sel = window.getSelection?.();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
