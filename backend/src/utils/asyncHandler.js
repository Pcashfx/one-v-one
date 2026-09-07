// Wraps an async Express route handler so rejected promises are passed to
// next(err) instead of crashing the process (Express 4 doesn't do this
// automatically for async functions).
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
