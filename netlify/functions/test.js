// netlify/functions/test.js
exports.handler = async (event, context) => {
  console.log("Test function executed!");
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Test successful!" }),
  };
};