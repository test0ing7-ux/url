async function test() {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzrYUNPYFeWYg_Pw1WZov5aryQhxno4pzW7Gd3kKRL4_rSkp21zHA0ByQyLWPy5tXcJ/exec";
    try {
        const response = await fetch(GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                key: "gsk_dummy",
                payload: {
                    model: "llama3-8b-8192",
                    messages: [{role: "user", content: "hello"}]
                }
            })
        });
        const text = await response.text();
        console.log("Status:", response.status);
        console.log("Headers:", response.headers.raw());
        console.log("Body:", text);
    } catch(e) {
        console.error(e);
    }
}
test();
