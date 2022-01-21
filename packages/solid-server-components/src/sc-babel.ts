import * as babel from '@babel/core';
import { addNamed } from '@babel/helper-module-imports';
import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';

type ImportHook = Map<string, t.Identifier>;

function getHookIdentifier(
  hooks: ImportHook,
  path: NodePath,
  name: string,
  source = 'solid-js',
): t.Identifier {
  const current = hooks.get(name);
  if (current) {
    return current;
  }
  const newID = addNamed(path, name, source);
  hooks.set(name, newID);
  return newID;
}

function createPropsScript(
  properties: (t.ObjectProperty | t.SpreadElement)[],
  key: t.Identifier,
): t.JSXElement {
  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier('script'), [
      t.jsxAttribute(t.jsxIdentifier('data-ssc-props'), t.jsxExpressionContainer(key)),
      t.jsxAttribute(t.jsxIdentifier('type'), t.stringLiteral('application/json')),
    ]),
    t.jsxClosingElement(t.jsxIdentifier('script')),
    [
      t.jsxExpressionContainer(
        t.callExpression(
          t.memberExpression(
            t.identifier('JSON'),
            t.identifier('stringify'),
          ),
          [
            t.objectExpression(properties),
          ],
        ),
      ),
    ],
  );
}

function createComponentEntrypoint(
  identifier: t.Identifier,
  key: t.Identifier,
): t.JSXElement {
  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier('script'), [
      t.jsxAttribute(t.jsxIdentifier('data-ssc'), t.jsxExpressionContainer(key)),
      t.jsxAttribute(t.jsxIdentifier('type'), t.stringLiteral('module')),
    ]),
    t.jsxClosingElement(t.jsxIdentifier('script')),
    [
      t.jsxExpressionContainer(
        t.templateLiteral(
          [
            t.templateElement({
              raw: 'import m from "'
            }),
            t.templateElement({
              raw: '";m("'
            }),
            t.templateElement({
              raw: '");'
            }, true),
          ],
          [
            identifier,
            key,
          ],
        ),
      ),
    ],
  );
}

export default function serverComponentsBabelPlugin(): babel.PluginObj {
  return {
    name: 'server-components',
    visitor: {
      Program(programPath) {
        const validIdentifiers = new Set(); 
        const hooks: ImportHook = new Map();
        programPath.traverse({
          ImportDeclaration(path) {
            if (/client(\.[tj]sx?)?$/.test(path.node.source.value)) {
              for (let i = 0, len = path.node.specifiers.length; i < len; i += 1) {
                const specifier = path.node.specifiers[i];
                if (t.isImportDefaultSpecifier(specifier)) {
                  validIdentifiers.add(specifier.local);
                }
              }
            }
          },
          JSXElement(path) {
            const opening = path.node.openingElement;
            if (t.isJSXIdentifier(opening.name)) {
              const binding = path.scope.getBinding(opening.name.name);
              if (
                binding
                && validIdentifiers.has(binding.identifier)
              ) {
                const id = path.scope.generateUidIdentifier('root');
                path.scope.push({
                  id,
                  init: t.callExpression(
                    getHookIdentifier(hooks, path, 'createUniqueId', 'solid-js'),
                    [],
                  ),
                  kind: 'const',
                });
                const properties: (t.ObjectProperty | t.SpreadElement)[] = [];

                for (let i = 0, len = opening.attributes.length; i < len; i += 1) {
                  const attr = opening.attributes[i];
                  if (t.isJSXAttribute(attr)) {
                    let id: t.Expression;
                    let computed = false;
                    if (t.isJSXNamespacedName(attr.name)) {
                      id = t.stringLiteral(`${attr.name.namespace}:${attr.name.name}`);
                      computed = true;
                    } else {
                      id = t.stringLiteral(attr.name.name);
                    }
                    let value: t.Expression;
                    if (attr.value) {
                      if (t.isJSXExpressionContainer(attr.value)) {
                        if (t.isExpression(attr.value.expression)) {
                          value = attr.value.expression;
                        } else {
                          value = t.booleanLiteral(true);
                        }
                      } else {
                        value = attr.value;
                      }
                    } else {
                      value = t.booleanLiteral(true);
                    }
                    properties.push(t.objectProperty(
                      id,
                      value,
                      computed,
                    ));
                  } else {
                    properties.push(t.spreadElement(
                      attr.argument,
                    ));
                  }
                }

                const entryPoint = createComponentEntrypoint(
                  binding.identifier,
                  id,
                );

                if (properties.length) {
                  path.replaceWith(
                    t.jsxFragment(
                      t.jsxOpeningFragment(),
                      t.jsxClosingFragment(),
                      [
                        createPropsScript(
                          properties,
                          id,
                        ),
                        entryPoint,
                      ],
                    ),
                  );
                } else {
                  path.replaceWith(entryPoint);
                }
              }
            }
          },
        });
      }
    },
  };
}