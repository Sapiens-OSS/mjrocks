import luaparse, {
  AssignmentStatement,
  Expression,
  TableKeyString,
} from "luaparse";

function recursivelyCreateObject(expression: Expression) {
  switch (expression.type) {
    case "StringLiteral":
      const value = expression.raw
        .replace(/^["\[]*/g, "")
        .replace(/["\]]*$/g, "");
      return value;
    case "TableConstructorExpression":
      const isArray =
        expression.fields.filter((e) => e.type === "TableValue").length ==
        expression.fields.length;
      if (isArray) {
        const array: any[] = [];
        for (const field of expression.fields) {
          if (field.type !== "TableValue") return;
          array.push(recursivelyCreateObject(field.value));
        }
        return array;
      } else {
        const table: { [key: string]: any } = {};
        for (const field of expression.fields) {
          let key;
          let value;
          if (field.type === "TableKey") {
            key = recursivelyCreateObject(field.key)?.toString();
            value = recursivelyCreateObject(field.value);
          }
          if (field.type === "TableKeyString") {
            key = field.key.name;
            value = recursivelyCreateObject(field.value);
          }
          if (!key) continue;
          table[key] = value;
        }
        return table;
      }

    default:
      console.log(`missing interpreter for ${expression.type}`);
      return undefined;
  }
}

interface Rockspec {
  package: string;
  version: string;
  source: { url: string; tag: string };
  dependencies: Array<{}>;
  build: {
    type: string;
    modules: { [key: string]: string };
  };
}

export function parseRockspec(spec: string) {
  const ast = luaparse.parse(spec);
  const body = ast.body;
  const assignmentStatements = body.filter(
    (e) => e.type === "AssignmentStatement"
  ) as AssignmentStatement[];

  const settings: { [key: string]: any } = {};

  for (const statement of assignmentStatements) {
    const settingsKey = statement.variables
      .filter((e) => e.type === "Identifier")
      .map((e) => e.name)[0];
    if (!settingsKey) continue;

    const initStatement = statement.init[0];
    settings[settingsKey] = recursivelyCreateObject(initStatement);
  }

  return settings as Rockspec;
}
