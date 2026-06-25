// ChipAwareInput 单元测试 —— 钉死三条核心行为：
//   1. 同槽点击 → 父组件 togglePendingTag 用同槽覆盖语义
//   2. 不同槽点击 → 父组件追加新 tag
//   3. backspace 在 text 为空时 → 删除最后一个 tag
//
// 1 和 2 的语义在 useRecipe 里，这里测的是组件 props 契约。
// 3 是组件自己的行为，必须钉在这里。

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChipAwareInput, type ChipTag } from '../app/features/fairy/components/ChipAwareInput';
import { useRecipe } from '../app/features/fairy/hooks/useRecipe';
import { renderHook, act } from '@testing-library/react';

describe('ChipAwareInput — chip 行为', () => {
  it('渲染初始 tag，editor 出现在 DOM 中', () => {
    const tags: ChipTag[] = [{ field: 'character', label: '冒牌公主' }];
    render(
      <ChipAwareInput
        tags={tags} text=""
        onTagsChange={() => {}} onTextChange={() => {}} onSend={() => {}}
      />
    );
    expect(screen.getByText('冒牌公主')).toBeInTheDocument();
    expect(screen.getByTestId('chip-aware-editor')).toBeInTheDocument();
  });

  it('text 为空时按 backspace → onTagsChange 收到去掉最后一个 tag 的数组', () => {
    const tags: ChipTag[] = [
      { field: 'character', label: '冒牌公主' },
      { field: 'conflict',  label: '时间倒流' },
    ];
    const onTagsChange = vi.fn();
    render(
      <ChipAwareInput
        tags={tags} text=""
        onTagsChange={onTagsChange} onTextChange={() => {}} onSend={() => {}}
      />
    );
    const editor = screen.getByTestId('chip-aware-editor');
    fireEvent.keyDown(editor, { key: 'Backspace' });
    expect(onTagsChange).toHaveBeenCalledWith([{ field: 'character', label: '冒牌公主' }]);
  });

  it('text 非空时按 backspace → 不触发 onTagsChange（让浏览器删字符）', () => {
    const tags: ChipTag[] = [{ field: 'character', label: '冒牌公主' }];
    const onTagsChange = vi.fn();
    render(
      <ChipAwareInput
        tags={tags} text="一些文字"
        onTagsChange={onTagsChange} onTextChange={() => {}} onSend={() => {}}
      />
    );
    // editor 内容应该已经被 useEffect 同步成 "一些文字"
    const editor = screen.getByTestId('chip-aware-editor');
    expect(editor.textContent).toBe('一些文字');
    fireEvent.keyDown(editor, { key: 'Backspace' });
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it('按 Enter → onSend 被调用，preventDefault 阻止换行', () => {
    const onSend = vi.fn();
    render(
      <ChipAwareInput
        tags={[]} text="hi"
        onTagsChange={() => {}} onTextChange={() => {}} onSend={onSend}
      />
    );
    const editor = screen.getByTestId('chip-aware-editor');
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disabled 时按 Enter / Backspace 都不触发回调', () => {
    const onSend = vi.fn();
    const onTagsChange = vi.fn();
    const tags: ChipTag[] = [{ field: 'character', label: '冒牌公主' }];
    render(
      <ChipAwareInput
        tags={tags} text=""
        onTagsChange={onTagsChange} onTextChange={() => {}} onSend={onSend}
        disabled
      />
    );
    const editor = screen.getByTestId('chip-aware-editor');
    fireEvent.keyDown(editor, { key: 'Enter' });
    fireEvent.keyDown(editor, { key: 'Backspace' });
    expect(onSend).not.toHaveBeenCalled();
    expect(onTagsChange).not.toHaveBeenCalled();
  });
});


describe('useRecipe.togglePendingTag — 三条规则', () => {
  it('规则 1：同槽点击不同 label → 覆盖', () => {
    const { result } = renderHook(() => useRecipe({ currentResult: null }));
    act(() => { result.current.togglePendingTag('character', '冒牌公主'); });
    act(() => { result.current.togglePendingTag('character', '失忆刺客'); });
    expect(result.current.pendingTags).toEqual([
      { field: 'character', label: '失忆刺客' },
    ]);
  });

  it('规则 2：不同槽点击 → 并列', () => {
    const { result } = renderHook(() => useRecipe({ currentResult: null }));
    act(() => { result.current.togglePendingTag('character', '冒牌公主'); });
    act(() => { result.current.togglePendingTag('conflict',  '时间倒流'); });
    act(() => { result.current.togglePendingTag('worldview', '时间图书馆'); });
    expect(result.current.pendingTags).toEqual([
      { field: 'character', label: '冒牌公主' },
      { field: 'conflict',  label: '时间倒流' },
      { field: 'worldview', label: '时间图书馆' },
    ]);
  });

  it('规则 3：再点同槽同 label → 取消（toggle off）', () => {
    const { result } = renderHook(() => useRecipe({ currentResult: null }));
    act(() => { result.current.togglePendingTag('character', '冒牌公主'); });
    act(() => { result.current.togglePendingTag('character', '冒牌公主'); });
    expect(result.current.pendingTags).toEqual([]);
  });

  it('clearPending 重置全部状态', () => {
    const { result } = renderHook(() => useRecipe({ currentResult: null }));
    act(() => {
      // 用带 preview 的 togglePendingTag 顺便设置 lastPickedCard
      result.current.togglePendingTag('character', '冒牌公主', '继位前发现族谱被篡改');
      result.current.setPendingText('再黑色幽默一点');
    });
    expect(result.current.lastPickedCard).not.toBeNull();
    act(() => { result.current.clearPending(); });
    expect(result.current.pendingTags).toEqual([]);
    expect(result.current.pendingText).toBe('');
    expect(result.current.lastPickedCard).toBeNull();
  });
});
