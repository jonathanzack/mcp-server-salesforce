export async function promptUser(message: string): Promise<string> {
  // Simulate user input for the purpose of this utility
  console.log(message);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdin.resume();
    stdout.write("> ");

    stdin.once("data", (data) => {
      resolve(data.toString().trim());
      stdin.pause();
    });
  });
}
