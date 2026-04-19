import { PORT } from "./config.js";
import "./db.js";
import { app } from "./app.js";

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
