/**
 * Local type declarations for `docusign-esign`.
 *
 * The official package ships pure JavaScript (no `.d.ts` files) and
 * DefinitelyTyped does not have a maintained types package for
 * version 8.x. We declare just the surface we use; everything else
 * is `unknown` and gets narrowed at the call site. If we end up
 * using a wider surface, expand this file rather than reaching for
 * `any`.
 *
 * Version pinned to 8.x — major API surface is stable.
 */

declare module "docusign-esign" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyRecord = Record<string, any>;

  export class ApiClient {
    constructor(options?: { basePath?: string; oAuthBasePath?: string });
    setBasePath(path: string): void;
    setOAuthBasePath(host: string): void;
    addDefaultHeader(name: string, value: string): void;
    requestJWTUserToken(
      clientId: string,
      userId: string,
      scopes: string[],
      privateKey: string | Buffer,
      expiresIn: number,
    ): Promise<{
      body: { access_token: string; expires_in: number; token_type: string };
    }>;
  }

  export class EnvelopesApi {
    constructor(apiClient: ApiClient);
    createEnvelope(
      accountId: string,
      options: { envelopeDefinition: EnvelopeDefinition },
    ): Promise<EnvelopeSummary>;
    getEnvelope(
      accountId: string,
      envelopeId: string,
      options: AnyRecord,
    ): Promise<AnyRecord>;
    listRecipients(
      accountId: string,
      envelopeId: string,
      options: AnyRecord,
    ): Promise<AnyRecord>;
    createRecipientView(
      accountId: string,
      envelopeId: string,
      options: { recipientViewRequest: RecipientViewRequest },
    ): Promise<{ url: string }>;
    update(
      accountId: string,
      envelopeId: string,
      options: { envelope: AnyRecord },
      query: AnyRecord,
    ): Promise<AnyRecord>;
    getDocument(
      accountId: string,
      envelopeId: string,
      documentId: string,
      options: AnyRecord,
    ): Promise<unknown>;
  }

  export interface EnvelopeDefinition {
    templateId?: string;
    templateRoles?: TemplateRole[];
    templateTabs?: AnyRecord;
    customFields?: AnyRecord;
    status?: string;
    emailSubject?: string;
    emailBlurb?: string;
    eventNotification?: AnyRecord;
    [k: string]: unknown;
  }

  export interface TemplateRole {
    email: string;
    name: string;
    roleName: string;
    clientUserId?: string;
    recipientId?: string;
    routingOrder?: string;
    tabs?: AnyRecord;
    [k: string]: unknown;
  }

  export interface EnvelopeSummary {
    envelopeId: string;
    uri?: string;
    statusDateTime?: string;
    status?: string;
    [k: string]: unknown;
  }

  export interface RecipientViewRequest {
    authenticationMethod?: string;
    clientUserId?: string;
    recipientId?: string;
    returnUrl?: string;
    userName?: string;
    email?: string;
    pingFrequency?: string;
    pingUrls?: string;
    [k: string]: unknown;
  }

  // The package exports a default `docusign` object containing the
  // class constructors, and TypeScript needs us to declare it as a
  // namespace + default import shape.
  const docusign: {
    ApiClient: typeof ApiClient;
    EnvelopesApi: typeof EnvelopesApi;
  };
  export default docusign;
  export { docusign };
}
