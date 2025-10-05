declare module "papaparse" {
  export type ParseResult<T = any> = { data: T[]; errors: any[]; meta: any };
  export type ParseConfig<T = any> = {
    header?: boolean;
    download?: boolean;
    skipEmptyLines?: boolean;
    complete?: (results: ParseResult<T>) => void;
  };
  export function parse<T = any>(input: any, config?: ParseConfig<T>): ParseResult<T>;
  const _default: { parse: typeof parse };
  export default _default;
}
