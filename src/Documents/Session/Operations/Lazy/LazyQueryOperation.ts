// public class LazyQueryOperation<T> implements ILazyOperation {
//      private final Class<T> _clazz;
//     private final DocumentConventions _conventions;
//     private final QueryOperation _queryOperation;
//     private final List<Consumer<QueryResult>> _afterQueryExecuted;
//      public LazyQueryOperation(Class<T> clazz, DocumentConventions conventions, QueryOperation queryOperation, List<Consumer<QueryResult>> afterQueryExecuted) {
//         _clazz = clazz;
//         _conventions = conventions;
//         _queryOperation = queryOperation;
//         _afterQueryExecuted = afterQueryExecuted;
//     }
//      @Override
//     public GetRequest createRequest() {
//         GetRequest request = new GetRequest();
//         request.setUrl("/queries");
//         request.setMethod("POST");
//         request.setQuery("?queryHash=" + _queryOperation.getIndexQuery().getQueryHash());
//         request.setContent(new IndexQueryContent(_conventions, _queryOperation.getIndexQuery()));
//         return request;
//     }
//      private Object result;
//     private QueryResult queryResult;
//     private boolean requiresRetry;
//      @Override
//     public Object getResult() {
//         return result;
//     }
//      public void setResult(Object result) {
//         this.result = result;
//     }
//      @Override
//     public QueryResult getQueryResult() {
//         return queryResult;
//     }
//      public void setQueryResult(QueryResult queryResult) {
//         this.queryResult = queryResult;
//     }
//      public boolean isRequiresRetry() {
//         return requiresRetry;
//     }
//      public void setRequiresRetry(boolean requiresRetry) {
//         this.requiresRetry = requiresRetry;
//     }
//      @Override
//     public void handleResponse(GetResponse response) {
//         if (response.isForceRetry()) {
//             result = null;
//             requiresRetry = true;
//             return;
//         }
//          try {
//             QueryResult queryResult = JsonExtensions.getDefaultMapper().readValue(response.getResult(), QueryResult.class);
//             handleResponse(queryResult);
//         } catch (IOException e) {
//             throw new RuntimeException(e);
//         }
//     }
//      private void handleResponse(QueryResult queryResult) {
//         _queryOperation.ensureIsAcceptableAndSaveResult(queryResult);
//          EventHelper.invoke(_afterQueryExecuted, queryResult);
//         result = _queryOperation.complete(_clazz);
//         this.queryResult = queryResult;
//     }
// }