// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A schema of the API's description (#178), as a list of its fields. Named schemas are links
// to their own entries at the end of the reference.
import ApiText from './api-text.jsx';
import { limits, refName, resolve, typeName } from '../lib/api-reference.js';

function Type({ schema }) {
  const name = refName(schema) ?? refName(schema?.items);
  const text = typeName(schema);
  if (!name) return <span className="api-type">{text}</span>;
  const [before, after] = text.split(name);
  return (
    <span className="api-type">
      {before}
      <a href={'#schema-' + name}>{name}</a>
      {after}
    </span>
  );
}
/** The fields an object schema lists, with nested objects expanded up to `depth`. */
export function ApiFields({ document, schema, depth = 0 }) {
  const resolved = schema?.$ref ? null : schema;
  const object = resolved?.type === 'array' && !resolved.items?.$ref ? resolved.items : resolved;
  const properties = Object.entries(object?.properties ?? {});
  if (!properties.length || depth > 3) return null;
  const required = object.required ?? [];
  return (
    <ul className="api-fields">
      {properties.map(([name, field]) => (
        <li key={name}>
          <code>{name}</code> <Type schema={field} />
          {required.includes(name) && <span className="api-required"> required</span>}
          {limits(field) && <span className="muted"> · {limits(field)}</span>}
          {field.description && (
            <div className="api-description">
              <ApiText text={field.description} />
            </div>
          )}
          <ApiFields document={document} schema={field} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}
/**
 * A body or response schema: its type, its description, and its fields, those of the named
 * schema it is (or lists) included.
 */
export default function ApiSchema({ document, schema }) {
  if (!schema) return null;
  const own = schema.$ref ? null : schema;
  const named = schema.$ref ?? (schema.type === 'array' ? schema.items?.$ref : null);
  return (
    <div className="api-schema">
      <Type schema={schema} />
      {own?.description && <ApiText text={own.description} />}
      <ApiFields document={document} schema={named ? resolve(document, { $ref: named }) : schema} />
    </div>
  );
}
