// netlify/functions/data.js (TEMPORÄR VEREINFACHT)
exports.handler = async (event, context) => {
  console.log("Simplified data.js function executed!");
  return {
    statusCode: 200,
    headers: {
       'Access-Control-Allow-Origin': '*',
       'Access-Control-Allow-Headers': 'Content-Type',
       'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
     },
    body: JSON.stringify({ message: "Simplified data function reporting for duty!" }),
  };
};