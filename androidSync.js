const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const readline = require("readline");

const EVENT_LINE_RE = /(\S+): (\S+) (\S+) (\S+)$/;
const STORE_LINE_RE = /(\S+) (\S+) (\S+) (\S+) (\S+)$/;

class Colors {
  static HEADER = "\x1b[95m";
  static OKBLUE = "\x1b[94m";
  static OKGREEN = "\x1b[92m";
  static WARNING = "\x1b[93m";
  static FAIL = "\x1b[91m";
  static ENDC = "\x1b[0m";
  static BOLD = "\x1b[1m";
  static UNDERLINE = "\x1b[4m";
}

const dlog = (msg) => console.log(String(msg));
const ilog = (msg) => console.log(`${Colors.OKBLUE}${msg}${Colors.ENDC}`);
const elog = (msg) => console.log(`${Colors.FAIL}${msg}${Colors.ENDC}`);

class AdbEventRecorder {
  constructor(adb) {
    this.adb_command = adb;
    this.adb_shell_command = "adb shell";
  }

  push(src, dst) {
    const result = spawn("adb", ["shell", "push", src, dst]);
    if (result.status !== 0) {
      throw new Error("push failed");
    }
  }

  goToActivity(activity) {
    ilog(`Go to the activity: ${activity}`);
    const result = spawn("adb", ["shell", "am", "start", "-a", activity]);
    if (result.status !== 0) {
      throw new Error("push failed");
    }
  }

  checkPermission() {
    ilog("Checking permission");
    const result = spawn("adb", ["root"]);
    if (result.status !== 0) {
      throw new Error("Insufficient permissions");
    }
  }

  listAllEvent() {
    ilog("List all events");
    const adb = spawn("adb", ["shell", "getevent", "-i"]);
    const rl = readline.createInterface({ input: adb.stdout });

    rl.on("line", (line) => {
      if (line.length !== 0) {
        dlog(line);
      }
    });
  }

  displayAllEvents() {
    const adb = spawn("adb", ["shell", "getevent", "-r", "-q"]);
    const rl = readline.createInterface({ input: adb.stdout });

    rl.on("line", (line) => {
      const millis = Date.now();
      if (line.length !== 0) {
        dlog(`${millis} ${line}`);
      }
    });
  }

  record(fpath, eventNum = null) {
    ilog("Start recording");
    const adb = spawn("adb", ["shell", "getevent"]);
    const outputFile = fs.createWriteStream(fpath);

    const rl = readline.createInterface({ input: adb.stdout });

    rl.on("line", (line) => {
      const millis = Date.now();
      const match = line.match(EVENT_LINE_RE);
      if (match !== null) {
        const [dev, etype, ecode, data] = match.slice(1);
        if (eventNum !== null && `/dev/input/event${eventNum}` !== dev) {
          return;
        }
        const rline = `${millis} ${dev} ${parseInt(etype, 16)} ${parseInt(
          ecode,
          16
        )} ${parseInt(data, 16)}\n`;
        dlog(rline);
        outputFile.write(rline);
      }
    });

    rl.on("close", () => {
      outputFile.close();
      ilog("End recording");
    });
  }

  async play(fpath, repeat = false) {
    ilog("Start playing");
    let lastTs = null;
    const lines = fs.readFileSync(fpath, "utf-8").split("\n");
    lines.forEach(async (line) => {
      const match = line.match(STORE_LINE_RE);
      if(!match) return;
      const [ts, dev, etype, ecode, data, last] = match;
      const tsMillis = parseFloat(ts);

      if (lastTs && tsMillis - lastTs > 0) {
          const deltaSecond = (tsMillis - lastTs) / 1000;
          await new Promise((resolve) => setTimeout(resolve, deltaSecond * 1000));
      }

      lastTs = tsMillis;
      spawnSync("adb", ["shell", "sendevent", etype, ecode, data, last]);
    })

    ilog("End playing");
  }
}

function main() {
  const adb = process.argv.includes("--device") ? ["adb", "-d"] : ["adb"];
  const adb_recorder = new AdbEventRecorder(adb);

  adb_recorder.listAllEvent();

  if (process.argv.includes("--record")) {
    // adb_recorder.checkPermission(); TODO: Fix & enable it
    const recordPath = process.argv[process.argv.indexOf("--record") + 1];
    adb_recorder.record(
      recordPath,
      process.argv.find((arg) => arg.startsWith("-n"))
    );
  } else if (process.argv.includes("--play")) {
    const playPath = process.argv[process.argv.indexOf("--play") + 1];
    const repeat = process.argv.includes("--repeat");
    const activity = process.argv.includes("--activity")
      ? process.argv[process.argv.indexOf("--activity") + 1]
      : null;

    if (activity) {
      adb_recorder.goToActivity(activity);
    }

    adb_recorder.play(playPath, repeat);
  } else if (process.argv.includes("--show")) {
    adb_recorder.checkPermission();
    adb_recorder.displayAllEvents();
  } else {
    elog("Add --record [Path] to record");
    elog("Add --play [Path] to play");
  }
}

main();
