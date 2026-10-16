// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The HTTP API's reference (#178), from its OpenAPI description (server/openapi), which
// /api/openapi.json serves for other tools.
import { openApiDocument } from '../../../../server/openapi/index.mjs';
import { siteName, siteOrigin } from '../../../lib/sharing.js';
import ApiText from '../../../components/api-text.jsx';
import ApiSchema, { ApiFields } from '../../../components/api-schema.jsx';
import ApiTry from '../../../components/api-try.jsx';
import ApiFilter, { ApiAnchors } from '../../../components/api-filter.jsx';
import {
  access,
  example,
  jsonBody,
  operationsByTag,
  streams,
  typeName,
} from '../../../lib/api-reference.js';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return {
    title: `HTTP API · ${siteName()}`,
    description: `The reference of ${siteName()}'s HTTP API, and its OpenAPI description.`,
    alternates: { canonical: '/docs/api' },
  };
}
const anchor = (operation, method, path) =>
  'op-' + (operation.operationId ?? method + path.replace(/[^a-z0-9]+/gi, '-'));
const tagAnchor = (name) => 'tag-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function Operation({ document, path, method, operation, parameters }) {
  const requestSchema = jsonBody(operation);
  const otherBody = !requestSchema && operation.requestBody;
  return (
    <details
      className="api-operation"
      id={anchor(operation, method, path)}
      data-api-search={`${method} ${path} ${operation.summary ?? ''} ${operation.tags?.join(' ') ?? ''}`.toLowerCase()}
    >
      <summary>
        <span className={'api-method api-' + method}>{method.toUpperCase()}</span>{' '}
        <code className="api-path">{path}</code>{' '}
        <span className="api-summary">{operation.summary}</span>
        {operation.deprecated && <span className="muted"> · deprecated</span>}
      </summary>
      <ApiText text={operation.description} />
      <p className="muted">Who: {access(operation.security ?? document.security)}</p>
      {parameters.length > 0 && (
        <>
          <h4>Parameters</h4>
          <ul className="api-fields">
            {parameters.map((p) => (
              <li key={p.in + p.name}>
                <code>{p.name}</code> <span className="api-type">{typeName(p.schema)}</span>{' '}
                <span className="muted">in {p.in}</span>
                {p.required && <span className="api-required"> required</span>}
                {p.description && (
                  <div className="api-description">
                    <ApiText text={p.description} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {operation.requestBody && (
        <>
          <h4>Request body</h4>
          <ApiText text={operation.requestBody.description} />
          {requestSchema && <ApiSchema document={document} schema={requestSchema} />}
          {otherBody &&
            Object.entries(otherBody.content ?? {}).map(([type, media]) => (
              <div key={type}>
                <code>{type}</code>
                <ApiSchema document={document} schema={media.schema} />
              </div>
            ))}
        </>
      )}
      <h4>Responses</h4>
      <dl className="api-responses">
        {Object.entries(operation.responses ?? {}).map(([status, response]) => (
          <div key={status}>
            <dt>
              <span className={status.startsWith('2') ? 'api-ok' : 'api-failed'}>{status}</span>
            </dt>
            <dd>
              <ApiText text={response.description} />
              {Object.entries(response.content ?? {}).map(([type, media]) =>
                status.startsWith('2') ? (
                  <div key={type}>
                    {type !== 'application/json' && <code>{type}</code>}
                    <ApiSchema document={document} schema={media.schema} />
                  </div>
                ) : null,
              )}
            </dd>
          </div>
        ))}
      </dl>
      {!streams(operation) && !otherBody && (
        <ApiTry
          method={method}
          path={path}
          parameters={parameters}
          body={requestSchema ? example(document, requestSchema) : null}
        />
      )}
    </details>
  );
}
export default function ApiReference() {
  const document = openApiDocument({ origin: siteOrigin(), name: siteName() });
  const groups = operationsByTag(document);
  const count = groups.reduce((n, group) => n + group.operations.length, 0);
  return (
    <main className="platform api-reference">
      <ApiAnchors />
      <nav className="api-contents" aria-label="API reference contents">
        <ApiFilter />
        {groups.map(({ tag, operations }) => (
          <div key={tag.name} data-api-group>
            <a className="api-contents-tag" href={'#' + tagAnchor(tag.name)}>
              {tag.name}
            </a>
            <ul>
              {operations.map(({ path, method, operation }) => (
                <li
                  key={method + path}
                  data-api-search={`${method} ${path} ${operation.summary ?? ''} ${tag.name}`.toLowerCase()}
                >
                  <a href={'#' + anchor(operation, method, path)}>
                    <span className={'api-method api-' + method}>{method.toUpperCase()}</span>{' '}
                    {operation.summary}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <a className="api-contents-tag" href="#schemas">
          Schemas
        </a>
      </nav>
      <div className="api-body-column">
        <h1>{document.info.title}</h1>
        <p className="muted">
          Version {document.info.version} · {count} operations ·{' '}
          <a href="/api/openapi.json">OpenAPI description (JSON)</a>, for Swagger UI, Postman,
          Insomnia or code generators
        </p>
        <ApiText text={document.info.description} />
        {groups.map(({ tag, operations }) => (
          <section key={tag.name} id={tagAnchor(tag.name)} data-api-group>
            <h2>{tag.name}</h2>
            <ApiText text={tag.description} />
            {operations.map((entry) => (
              <Operation key={entry.method + entry.path} document={document} {...entry} />
            ))}
          </section>
        ))}
        <section id="schemas">
          <h2>Schemas</h2>
          {Object.entries(document.components.schemas).map(([name, schema]) => (
            <details key={name} id={'schema-' + name} className="api-operation">
              <summary>
                <code>{name}</code> <span className="api-type">{typeName(schema)}</span>
              </summary>
              <ApiText text={schema.description} />
              <ApiFields document={document} schema={schema} />
            </details>
          ))}
        </section>
      </div>
    </main>
  );
}
