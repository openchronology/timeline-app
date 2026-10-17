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
// Rendered per request: the document names the site's own origin and name, which are
// settings read at run time.
export const dynamic = 'force-dynamic';
/** The page's title, description and canonical address. */
export function generateMetadata() {
  return {
    title: `HTTP API · ${siteName()}`,
    description: `The reference of ${siteName()}'s HTTP API, and its OpenAPI description.`,
    alternates: { canonical: '/docs/api' },
  };
}
/**
 * The id of an operation's section, for links from the contents: its operationId, or its
 * method and path made into a fragment when it has none.
 */
const anchor = (operation, method, path) =>
  'op-' + (operation.operationId ?? method + path.replace(/[^a-z0-9]+/gi, '-'));
/** The id of a group's (an OpenAPI tag's) section. */
const tagAnchor = (name) => 'tag-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * One operation of the API, as a collapsible section: its method, path and summary; who may
 * call it; its parameters, request body and responses; and a form to try it (ApiTry).
 *
 * `data-api-search` holds the words the contents' filter (ApiFilter) matches against.
 *
 * @param {object} props
 * @param {object} props.document the whole OpenAPI document, to resolve `$ref`s in schemas
 * @param {string} props.path the operation's path template, such as `/api/timelines/{id}`
 * @param {string} props.method its HTTP method, in lower case
 * @param {object} props.operation the OpenAPI operation object
 * @param {object[]} props.parameters its parameters, with the path's own merged in
 */
function Operation({ document, path, method, operation, parameters }) {
  const requestSchema = jsonBody(operation);
  // A body that is not JSON (such as a timeline file to import): shown by media type, and
  // not tried from here.
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
      {/* An operation's own security requirements, or else the document's default ones. */}
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
              {/* Bodies only for successes: every failure has the same error shape. */}
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
      {/* Endless streams can't be shown, and the form only sends JSON, so neither is tried. */}
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
/**
 * The API reference (/docs/api): the OpenAPI document built for this site's origin and name
 * (the same one /api/openapi.json serves), shown as contents with a filter, then each group of
 * operations, then every schema. It reads nothing per visitor; trying an operation is done in
 * the browser by ApiTry.
 */
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
