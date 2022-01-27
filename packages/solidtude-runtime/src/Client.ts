import {
  createComponent,
  createUniqueId,
  JSX,
  mergeProps,
} from 'solid-js';
import {
  escape,
  renderToString,
  ssr,
  ssrHydrationKey,
} from 'solid-js/web';
import { Strategy } from './create-solidtude-root';

const ROOT = ['<solidtude-root', ' data-ssc="', '">', '</solidtude-root>'];
const TEMPLATE = ['<template', ' data-ssc="', '">', '</template>'];
const SCRIPT = ['<script', ' type="module">', '</script>'];

interface ClientComp<P> {
  (props: P & { children: JSX.Element }): JSX.Element;
  src: string;
}

interface ClientProps<P> {
  Comp: ClientComp<P>;
  props: P;
  children: JSX.Element;
  hydratable: boolean;
  strategy?: Strategy;
}

export default function Client<P>(props: ClientProps<P>) {
  const root = createUniqueId();
  const result = renderToString(
    () => (
      createComponent(
        props.Comp,
        mergeProps(props.props, {
          get children() {
            return props.children;
          },
        }),
      )
    ),
    {
      renderId: root,
    },
  );
  const templateResult = renderToString(
    () => (
      props.children
    ),
    {
      renderId: root,
    },
  );

  const propsResult = JSON.stringify(props.props);
  if (props.strategy?.type === 'visible') {
    props.strategy.value = root;
  }
  const strategyResult = JSON.stringify(props.strategy);

  return [
    ssr(ROOT, ssrHydrationKey(), escape(root), result),
    ssr(TEMPLATE, ssrHydrationKey(), escape(root), templateResult),
    ssr(
      SCRIPT,
      ssrHydrationKey(),
      `import m from '${props.Comp.src}';m('${root}',${propsResult},${strategyResult},${String(props.hydratable)})`,
    ),
  ];
}
