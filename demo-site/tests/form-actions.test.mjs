import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const directory = fileURLToPath(
  new URL('../components/live/', import.meta.url),
);

// Base UI buttons default to type="button", even when placed inside a form.
// Check the actual service forms so new or edited forms cannot silently stop submitting.
for (const filename of readdirSync(directory).filter((name) =>
  name.endsWith('.tsx'),
)) {
  const source = ts.createSourceFile(
    filename,
    readFileSync(join(directory, filename), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function attribute(element, name) {
    return element.attributes.properties.find(
      (prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === name,
    );
  }

  function visit(node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(source) === 'form' &&
      attribute(node.openingElement, 'onSubmit')
    ) {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      test(`${filename}:${line} has an explicit submit button`, () => {
        let submitCount = 0;
        function inspect(child) {
          if (
            child !== node &&
            ts.isJsxElement(child) &&
            child.openingElement.tagName.getText(source) === 'form'
          )
            return;
          const element = ts.isJsxElement(child)
            ? child.openingElement
            : ts.isJsxSelfClosingElement(child)
              ? child
              : null;
          if (
            element &&
            ['Button', 'button'].includes(element.tagName.getText(source))
          ) {
            const type = attribute(element, 'type')?.initializer;
            assert.ok(
              type && ts.isStringLiteral(type),
              'Form buttons must explicitly declare their type.',
            );
            assert.ok(['button', 'submit', 'reset'].includes(type.text));
            if (type.text === 'submit') submitCount++;
          }
          ts.forEachChild(child, inspect);
        }
        inspect(node);
        assert.ok(
          submitCount > 0,
          'The form has no submit button; clicking cannot run onSubmit.',
        );
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
