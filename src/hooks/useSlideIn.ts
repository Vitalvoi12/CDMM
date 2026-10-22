import { useState } from 'react';

/**
 * The entrance for a view that just replaced another: from the right when it
 * comes after the old one in `order`, from the left when before, none at
 * first or when either is not in `order`. Classes from index.css (phone only).
 */
export function useSlideIn<T>(value: T, order: readonly T[]): string {
  const [state, setState] = useState({ value, cls: '' });
  if (state.value !== value) {
    const from = order.indexOf(state.value);
    const to = order.indexOf(value);
    const cls = from < 0 || to < 0 ? '' : to > from ? 'page-from-right' : 'page-from-left';
    setState({ value, cls });
    return cls;
  }
  return state.cls;
}
