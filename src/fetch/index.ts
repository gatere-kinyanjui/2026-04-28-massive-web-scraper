import axios from "axios";

async function fetchPage(url: string) {
  const response = await axios.get(url);
  console.log(response.data.slice(0, 200));
}

export default fetchPage;
