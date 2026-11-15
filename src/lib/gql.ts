/**
 * Every GraphQL document Support sends is written with this tag, as a fixed, named operation.
 * Hasura's allow-list only accepts documents it knows, so a document must never be built at
 * runtime: the only substitutions allowed are constants whose value is a single string literal
 * (the compiler rejects anything else). `scripts/graphql-manifest.mjs` lists every `gql`
 * document in `graphql-manifest/support-current.json`.
 */
declare const documentBrand: unique symbol;

/** A document made by {@link gql}; the only kind `staffGql` sends. */
export type GqlDocument = string & { readonly [documentBrand]: true };

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

/** A string literal type that is neither `string` nor a union of literals. */
type FixedText<S> = string extends S ? never : [IsUnion<S>] extends [false] ? S : never;

export function gql<const V extends readonly string[]>(
  strings: TemplateStringsArray,
  ...values: { [K in keyof V]: FixedText<V[K]> } & V
): GqlDocument {
  let document = strings[0];
  for (let i = 0; i < values.length; i++) document += values[i] + strings[i + 1];
  return document as GqlDocument;
}
