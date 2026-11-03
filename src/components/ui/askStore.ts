/**
 * One pending question at a time (confirmDialog, promptDialog), shared by the
 * imperative call and the host component that draws it.
 *
 * A new question while another is still open answers the old one with
 * `dismissed` (as if cancelled): before, the old promise was dropped and its
 * caller waited forever. Each question is answered exactly once.
 */
export interface Pending<O, A> {
  id: number;
  options: O;
  answer: (value: A) => void;
}

export function createAskStore<O, A>(dismissed: A) {
  let listeners: Array<(p: Pending<O, A> | null) => void> = [];
  let current: Pending<O, A> | null = null;
  let seq = 0;
  const emit = () => listeners.forEach((l) => l(current));

  const settle = (p: Pending<O, A> | null, value: A) => {
    if (!p || p !== current) return;
    current = null;
    p.answer(value);
    emit();
  };

  return {
    ask(options: O): Promise<A> {
      return new Promise<A>((resolve) => {
        if (current) settle(current, dismissed);
        let done = false;
        const p: Pending<O, A> = {
          id: ++seq,
          options,
          answer: (v) => {
            if (done) return;
            done = true;
            resolve(v);
          },
        };

        current = p;
        emit();
      });
    },
    /** Answers the question that is open now (if `id` is still the open one). */
    answer(id: number, value: A) {
      if (current && current.id === id) settle(current, value);
    },
    current: () => current,
    subscribe(l: (p: Pending<O, A> | null) => void) {
      listeners.push(l);
      l(current);

      return () => {
        listeners = listeners.filter((x) => x !== l);
      };
    },
  };
}
