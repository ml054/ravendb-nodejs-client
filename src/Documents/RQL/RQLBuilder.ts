// import {RQLOperator, RQLOperators} from "./RQLOperator";
// import {RQLConditionValue, RQLValue, RQLRangeValue} from "./RQLValue";
// import {StringUtil} from "../../Utility/StringUtil";
// import {TypeUtil} from "../../Utility/TypeUtil";
// import {DocumentConventions} from "../Conventions/DocumentConventions";
// import {DateUtil} from "../../Utility/DateUtil";
//
// export class RQLBuilder {
//   protected static readonly emptyString = '';
//   protected static readonly nullValue = 'null';
//   protected readonly where: string = 'WHERE';
//
//   private addOperator(str, from, operator?): string {
//     return StringUtil.format(`FROM {0} {2} {1}`, str, from, operator);
//   }
//
//   public buildQuery(from?: string, operator: string): string {
//
//     let RQLText: string = null;
//
//     if(from) {
//       RQLText = StringUtil.format(`FROM {0}`, from);
//     }
//
//     switch (operator) {
//       case RQLOperators.greaterThan:
//         RQLText = StringUtil.format(`{0}>{1}`, RQLField, RQLText);
//         break;
//       case RQLOperators.Search:
//         RQLText = StringUtil.format(`search({0},'{1}') OR boost({0} = '{1}', {2})`, RQLField, RQLText, boost);
//         break;
//       case RQLOperators.Select:
//         RQLText = StringUtil.format(`SELECT {0} FROM {1}`, RQLField, RQLText);
//         break;
//       case RQLOperators.Equals:
//         (RQLText === null || RQLText === 'null') ?
//           RQLText = StringUtil.format(`{0}={1}`, RQLField, RQLText) :
//           RQLText = StringUtil.format(`{0}='{1}'`, RQLField, RQLText);
//         break;
//       case RQLOperators.Between:
//         RQLText = StringUtil.format(`{0} BETWEEN {1}`, RQLField, RQLText);
//         break;
//       case RQLOperators.EqualBetween:
//         RQLText = StringUtil.format(`{0}`, RQLField, RQLText);
//         break;
//       case RQLOperators.StartsWith:
//         RQLText = StringUtil.format(`StartsWith({0}, '{1}')`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.EndsWith:
//         RQLText = StringUtil.format(`EndsWith({0}, '{1}')`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.In:
//         RQLText = StringUtil.format(`{0} IN ('{1}')`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.orderBy:
//         RQLText = StringUtil.format(`ORDER BY '{0}'`, RQLText);
//         RQLText = this.addOperator(from, RQLText);
//         break;
//     }
//
//     return RQLText as string;
//
//   }
//
//   public buildCondition<T extends RQLConditionValue>(from, conventions: DocumentConventions,
//                                                             fieldName: string, value: T, operator?: RQLOperator,
//                                                             boost: number = 1): string {
//     let RQLField: string = fieldName;
//     let RQLText: string | null = this.toRQL(value, operator);
//
//     switch (operator) {
//       case RQLOperators.StartsWith:
//       case RQLOperators.EndsWith:
//         if (!TypeUtil.isNone(value) && !TypeUtil.isString(value)) {
//           RQLField = conventions.rangedFieldName(fieldName, value);
//         }
//         break;
//       case RQLOperators.Between:
//       case RQLOperators.EqualBetween:
//         const rangedValue: RQLRangeValue<RQLValue> = value as RQLRangeValue<RQLValue>;
//         const minOrMax: RQLValue = rangedValue.min || rangedValue.max;
//         break;
//     }
//
//     switch (operator) {
//       case RQLOperators.lessThan:
//         RQLText = StringUtil.format(`{0}<{1}`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.greaterThan:
//         RQLText = StringUtil.format(`{0}>{1}`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.Search:
//         RQLText = StringUtil.format(`search({0},'{1}') OR boost({0} = '{1}', {2})`, RQLField, RQLText, boost);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.Select:
//         RQLText = StringUtil.format(`SELECT {0} FROM {1}`, RQLField, RQLText);
//         break;
//       case RQLOperators.Equals:
//         (RQLText === null || RQLText === 'null') ?
//           RQLText = StringUtil.format(`{0}={1}`, RQLField, RQLText) :
//           RQLText = StringUtil.format(`{0}='{1}'`, RQLField, RQLText);
//
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.Between:
//         RQLText = StringUtil.format(`{0} BETWEEN {1}`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.EqualBetween:
//         RQLText = StringUtil.format(`{0}`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.StartsWith:
//         RQLText = StringUtil.format(`StartsWith({0}, '{1}')`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.EndsWith:
//         RQLText = StringUtil.format(`EndsWith({0}, '{1}')`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.In:
//         RQLText = StringUtil.format(`{0} IN ('{1}')`, RQLField, RQLText);
//         RQLText = this.addOperator(from, RQLText, RQLBuilder.where);
//         break;
//       case RQLOperators.orderBy:
//         RQLText = StringUtil.format(`ORDER BY '{0}'`, RQLText);
//         RQLText = this.addOperator(from, RQLText);
//         break;
//     }
//
//     return RQLText as string;
//   }
//
//
//   protected toRQL<T extends RQLConditionValue>(value, operator: RQLOperator): string | null {
//
//     let queryText = '';
//
//     switch (operator) {
//       case RQLOperators.In:
//         const inConditionValues = value;
//         queryText = inConditionValues;
//         break;
//       case RQLOperators.Between:
//       case RQLOperators.EqualBetween:
//         const conditionRange: RQLRangeValue<RQLValue> = value as RQLRangeValue<RQLValue>;
//         const conditionTemplate = (operator === RQLOperators.EqualBetween)
//           ? `'{0}' AND '{1}'` : `'{0}' AND '{1}'`;
//
//         queryText = StringUtil.format(conditionTemplate,
//           this.valueToRQLSyntax(conditionRange.min, '*'),
//           this.valueToRQLSyntax(conditionRange.max, 'NULL'),
//           this.valueToRQLSyntax(conditionRange.orName, 'NULL'),
//           this.valueToRQLSyntax(conditionRange.orValue, 'NULL')
//         );
//         break;
//       default:
//         if (TypeUtil.isString(value) && (value as string).includes(' ')) {
//           queryText = StringUtil.format('"{0}"', value as string);
//         } else {
//           queryText = TypeUtil.isNone(value) ? this.nullValue : this.valueToRQLString(value as RQLValue);
//         }
//         break;
//     }
//
//     return queryText;
//   }
//
//   protected valueToRQLString(value?: RQLValue): string {
//     if (TypeUtil.isNone(value)) {
//       return '';
//     }
//
//     if (TypeUtil.isDate(value)) {
//       return DateUtil.stringify(value as Date);
//     }
//
//     if (!TypeUtil.isString(value)) {
//       return value.toString();
//     }
//
//     return value as string;
//   }
//
//   protected valueToRQLSyntax(value?: RQLValue): string {
//
//     if (TypeUtil.isNone(value)) {
//       return null;
//     }
//
//     const stringValue = this.valueToRQLString(value);
//
//     return ('' == stringValue) ? this.emptyString : stringValue;
//   }
// }