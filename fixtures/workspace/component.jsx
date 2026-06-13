const React = { createElement: (tag, props, ...kids) => ({ tag, props, kids }) };

let label = 0; // T: number
label = 'oops';

export const el = <div className="x">{label}</div>;
