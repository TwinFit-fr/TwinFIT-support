#!/usr/bin/env node
// Lists every GraphQL operation Support sends (each `gql` document in src/) in
// graphql-manifest/support-current.json, the shared format the backend reads to build the
// Hasura allow-list.
//
//   node scripts/graphql-manifest.mjs           write the manifest
//   node scripts/graphql-manifest.mjs --check   fail if the manifest is out of date
//
// Documents are read from the source with the TypeScript checker, so a `${CONSTANT}` inside a
// `gql` template is replaced by its string literal, as at runtime. Anything that is not a fixed,
// named operation fails here (and the compiler rejects most of it earlier, see src/lib/gql.ts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "graphql";
import ts from "typescript";
import { samePath, toLf, toPosix } from "./graphql-manifest-paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "graphql-manifest", "support-current.json");
const gqlModule = path.join(root, "src", "lib", "gql.ts");

function createProgram() {
  const configPath = path.join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

function isSourceFile(file) {
  const rel = path.relative(path.join(root, "src"), file.fileName);
  return !rel.startsWith("..") && !file.isDeclarationFile && !/\.test\.tsx?$/.test(rel);
}

function collectDocuments(program) {
  const checker = program.getTypeChecker();
  const problems = [];
  const documents = [];

  const where = (sf, node) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return `${toPosix(path.relative(root, sf.fileName))}:${line + 1}`;
  };
  const isGql = (node) => {
    if (!ts.isIdentifier(node) || node.text !== "gql") return false;
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const declared = symbol?.declarations?.[0]?.getSourceFile().fileName;
    return declared !== undefined && samePath(declared, gqlModule);
  };

  for (const sf of program.getSourceFiles().filter(isSourceFile)) {
    if (samePath(sf.fileName, gqlModule)) continue;
    const visit = (node) => {
      if (ts.isTaggedTemplateExpression(node) && isGql(node.tag)) {
        const template = node.template;
        let text;
        if (ts.isNoSubstitutionTemplateLiteral(template)) {
          text = template.text;
        } else {
          text = template.head.text;
          for (const span of template.templateSpans) {
            const type = checker.getTypeAtLocation(span.expression);
            if (!type.isStringLiteral()) {
              problems.push(`${where(sf, span.expression)}: \${...} is not a string literal constant`);
              text = null;
              break;
            }
            text += type.value + span.literal.text;
          }
        }
        if (text !== null) documents.push({ text, at: where(sf, node) });
        return;
      }
      if (ts.isIdentifier(node) && isGql(node) && !(ts.isTaggedTemplateExpression(node.parent) && node.parent.tag === node)) {
        if (!ts.isImportSpecifier(node.parent)) {
          problems.push(`${where(sf, node)}: gql is only used as a template tag`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { documents, problems };
}

function buildManifest() {
  const { documents, problems } = collectDocuments(createProgram());
  const byName = new Map();
  for (const { text, at } of documents) {
    let ast;
    try {
      ast = parse(text);
    } catch (error) {
      problems.push(`${at}: invalid GraphQL (${error.message})`);
      continue;
    }
    const definitions = ast.definitions;
    const operation = definitions[0];
    if (definitions.length !== 1 || operation.kind !== "OperationDefinition") {
      problems.push(`${at}: a document must be exactly one operation (no fragments, no extra operations)`);
      continue;
    }
    if (operation.operation === "subscription") {
      problems.push(`${at}: subscriptions are not part of the manifest`);
      continue;
    }
    const name = operation.name?.value;
    if (!name) {
      problems.push(`${at}: anonymous operation`);
      continue;
    }
    if (!/^Support[A-Z]/.test(name)) {
      problems.push(`${at}: operation ${name} must start with "Support" (names are unique across clients)`);
      continue;
    }
    if (byName.has(name)) {
      problems.push(`${at}: operation ${name} is already defined at ${byName.get(name).at}`);
      continue;
    }
    byName.set(name, { name, query: text, at });
  }
  if (problems.length) {
    console.error(`GraphQL manifest: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  const operations = [...byName.values()]
    .map(({ name, query }) => ({ name, query }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return `${JSON.stringify({ client: "support", version: "current", operations }, null, 2)}\n`;
}

const manifest = buildManifest();
const count = JSON.parse(manifest).operations.length;
if (process.argv.includes("--check")) {
  const current = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
  if (toLf(current) !== manifest) {
    console.error(
      "graphql-manifest/support-current.json is out of date: a GraphQL operation changed.\n" +
        "Run `npm run graphql-manifest` and commit the result.",
    );
    process.exit(1);
  }
  console.log(`GraphQL manifest up to date (${count} operations).`);
} else {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, manifest);
  console.log(`Wrote ${path.relative(root, manifestPath)} (${count} operations).`);
}
