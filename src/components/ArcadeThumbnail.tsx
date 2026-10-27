import type { ReactNode } from "react";
import type { GameId } from "../data/arcade";

const frame = (children: ReactNode) => (
  <>
    <rect x="0" y="0" width="320" height="112" rx="12" fill="var(--surface-0)" />
    <path d="M0 82h320" stroke="var(--line)" opacity=".45" />
    {children}
  </>
);

function NumberTiles() {
  const values = [2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 2048];
  return (
    <g data-thumbnail-artwork="2048" transform="translate(127 7)">
      {values.map((value, index) => {
        const x = (index % 4) * 16.5;
        const y = Math.floor(index / 4) * 16.5;
        const tint = value <= 4 ? 12 : value <= 16 ? 22 : value <= 64 ? 34 : value <= 256 ? 46 : value <= 1024 ? 58 : 70;
        return (
          <g key={index}>
            <rect x={x} y={y} width="15" height="15" rx="2.5" fill={`color-mix(in srgb, var(--game-accent) ${tint}%, var(--surface-1))`} stroke="var(--line)" strokeWidth=".6" />
            <text x={x + 7.5} y={y + 10.2} textAnchor="middle" fill="var(--text)" fontSize={value > 999 ? 4.6 : value > 99 ? 5.4 : 7} fontWeight="700">{value}</text>
          </g>
        );
      })}
    </g>
  );
}

function ThumbnailArtwork({ gameId }: { gameId: GameId }) {
  switch (gameId) {
    case "2048":
      return frame(<><rect x="125" y="5" width="68" height="68" rx="4" fill="var(--surface-1)" stroke="var(--line)" /><NumberTiles /></>);
    case "snake":
      return frame(
        <g transform="translate(92 8)">
          <rect width="136" height="68" rx="8" fill="var(--surface-1)" stroke="var(--line)" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={`v${i}`} d={`M${i * 22.6} 0v68`} stroke="var(--line)" opacity=".3" />)}
          {[0, 1, 2].map((i) => <path key={`h${i}`} d={`M0 ${i * 22.6}h136`} stroke="var(--line)" opacity=".3" />)}
          <path d="M38 46h22V24h44" fill="none" stroke="var(--game-accent)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="105" cy="24" r="6" fill="#dc806d" />
          <circle cx="104" cy="22" r="1.5" fill="white" />
        </g>,
      );
    case "memory":
      return frame(
        <g transform="translate(115 12)">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = (i % 3) * 31;
            const y = Math.floor(i / 3) * 34;
            const flipped = [0, 3, 4].includes(i);
            return <g key={i}><rect x={x} y={y} width="27" height="30" rx="5" fill={flipped ? "color-mix(in srgb, var(--game-accent) 29%, var(--surface-1))" : "var(--surface-1)"} stroke={flipped ? "var(--game-accent)" : "var(--line)"} /><text x={x + 13.5} y={y + 20} textAnchor="middle" fill={flipped ? "var(--text)" : "var(--text-muted)"} fontSize="13" fontWeight="650">{flipped ? ["◆", "", "", "◆", "●", ""][i] : "✦"}</text></g>;
          })}
        </g>,
      );
    case "reaction":
      return frame(
        <g>
          <rect x="91" y="18" width="138" height="44" rx="10" fill="var(--surface-1)" stroke="var(--line)" />
          <circle cx="117" cy="40" r="10" fill="#76b78f" />
          <path d="M113 40l3 3 6-7" fill="none" stroke="#14221a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="137" y="44" fill="var(--text)" fontSize="17" fontWeight="650" fontVariant="tabular-nums">0.248</text>
          <text x="194" y="44" fill="var(--text-muted)" fontSize="7">s</text>
          <rect x="137" y="50" width="67" height="2" rx="1" fill="var(--game-accent)" />
        </g>,
      );
    case "word-guess":
      return frame(
        <g transform="translate(119 8)">
          {["K", "R", "A", "F", "T"].map((letter, i) => <g key={letter}><rect x={i * 17} y="0" width="15" height="15" rx="3" fill={i === 0 || i === 3 ? "#6a9f79" : i === 2 ? "#ad914f" : "color-mix(in srgb, var(--game-accent) 14%, var(--surface-1))"} stroke={i < 4 ? "transparent" : "var(--line)"} /><text x={i * 17 + 7.5} y="10.5" textAnchor="middle" fill={i < 4 ? "#fff" : "var(--text-muted)"} fontSize="7" fontWeight="700">{letter}</text></g>)}
          {[0, 1, 2, 3, 4].map((i) => <g key={i}><rect x={i * 17} y="18" width="15" height="15" rx="3" fill="color-mix(in srgb, var(--game-accent) 10%, var(--surface-1))" stroke="var(--line)" /><rect x={i * 17} y="36" width="15" height="15" rx="3" fill="color-mix(in srgb, var(--game-accent) 10%, var(--surface-1))" stroke="var(--line)" /></g>)}
        </g>,
      );
    case "brick-breaker":
      return frame(
        <g>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => <rect key={i} x={102 + (i % 6) * 20} y={14 + Math.floor(i / 6) * 12} width="17" height="8" rx="2" fill={i < 6 ? "color-mix(in srgb, var(--game-accent) 68%, var(--surface-1))" : "color-mix(in srgb, var(--game-accent) 35%, var(--surface-1))"} stroke="var(--surface-0)" />)}
          <path d="M128 44l19-12" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx="149" cy="30" r="4" fill="var(--text)" />
          <rect x="126" y="66" width="65" height="6" rx="3" fill="var(--game-accent)" />
        </g>,
      );
    case "geometry-runner":
      return frame(
        <g data-thumbnail-artwork="geometry-runner">
          <path d="M77 64h166" stroke="var(--line)" strokeWidth="2" />
          <path d="M168 63l8-13 8 13z" fill="color-mix(in srgb, var(--game-accent) 54%, var(--surface-1))" stroke="var(--game-accent)" strokeWidth="1" data-runner-obstacle="" />
          <path d="M200 63l11-18 11 18z" fill="color-mix(in srgb, var(--game-accent) 54%, var(--surface-1))" stroke="var(--game-accent)" strokeWidth="1" data-runner-obstacle="" />
          <path d="M230 63l7-11 7 11z" fill="color-mix(in srgb, var(--game-accent) 54%, var(--surface-1))" stroke="var(--game-accent)" strokeWidth="1" data-runner-obstacle="" />
          <g transform="translate(132 43) rotate(-8 9 9)">
            <rect width="18" height="18" fill="var(--game-accent)" stroke="var(--surface-0)" strokeWidth="1.2" />
          </g>
          <path d="M86 69h148" stroke="var(--line)" strokeWidth=".7" strokeDasharray="2 4" opacity=".8" />
        </g>,
      );
    case "air-hockey":
      return frame(
        <g>
          <rect x="98" y="8" width="124" height="68" rx="12" fill="color-mix(in srgb, var(--game-accent) 10%, var(--surface-1))" stroke="var(--line)" />
          <path d="M160 8v68M98 42h124" stroke="var(--line)" />
          <circle cx="160" cy="42" r="14" fill="none" stroke="var(--line)" />
          <path d="M139 8v7a6 6 0 0 0 6 6h30a6 6 0 0 0 6-6V8M139 76v-7a6 6 0 0 1 6-6h30a6 6 0 0 1 6 6v7" fill="none" stroke="var(--line)" />
          <circle cx="160" cy="32" r="7" fill="var(--game-accent)" stroke="var(--surface-0)" strokeWidth="2" />
          <circle cx="145" cy="55" r="6" fill="#bd7b70" stroke="var(--surface-0)" strokeWidth="2" />
          <circle cx="168" cy="46" r="4" fill="var(--text)" />
        </g>,
      );
    case "sliding":
      return frame(
        <g transform="translate(129 8)">
          {[1, 2, 3, 4, 5, 6, 7, 8, 0].map((value, i) => {
            const x = (i % 3) * 21;
            const y = Math.floor(i / 3) * 21;
            return <g key={i}><rect x={x} y={y} width="18" height="18" rx="3" fill={value ? "color-mix(in srgb, var(--game-accent) 18%, var(--surface-1))" : "transparent"} stroke={value ? "var(--line)" : "var(--game-accent)"} strokeDasharray={value ? undefined : "2 2"} /><text x={x + 9} y={y + 12} textAnchor="middle" fill="var(--text)" fontSize="8" fontWeight="650">{value || ""}</text></g>;
          })}
        </g>,
      );
    case "aim-trainer":
      return frame(
        <g>
          <circle cx="160" cy="42" r="25" fill="color-mix(in srgb, var(--game-accent) 13%, var(--surface-1))" stroke="var(--game-accent)" strokeWidth="2" />
          <circle cx="160" cy="42" r="16" fill="none" stroke="var(--game-accent)" strokeWidth="2" />
          <circle cx="160" cy="42" r="7" fill="var(--game-accent)" />
          <circle cx="110" cy="24" r="8" fill="none" stroke="var(--text-muted)" strokeWidth="2" />
          <circle cx="213" cy="59" r="5" fill="none" stroke="var(--text-muted)" strokeWidth="2" />
          <path d="M160 11v8M160 65v8M129 42h8M183 42h8" stroke="var(--text-muted)" />
        </g>,
      );
    case "simon-says":
      return frame(
        <g data-thumbnail-artwork="simon-says" transform="translate(126 9)">
          {[
            { color: "#a94d50", x: 0, y: 0, number: "1" },
            { color: "#446f9b", x: 35, y: 0, number: "2" },
            { color: "#a27d38", x: 0, y: 35, number: "3" },
            { color: "#4d8065", x: 35, y: 35, number: "4" },
          ].map(({ color, x, y, number }) => (
            <g key={number} data-simon-pad="">
              <rect x={x} y={y} width="32" height="32" rx="4" fill={color} stroke="var(--surface-0)" strokeWidth="1.5" />
              <text x={x + 16} y={y + 21} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">{number}</text>
            </g>
          ))}
          <rect x="31" y="31" width="5" height="5" fill="var(--surface-0)" stroke="var(--game-accent)" strokeWidth="1" />
        </g>,
      );
    case "line-rider":
      return frame(
        <g data-thumbnail-artwork="line-rider" transform="translate(78 8)">
          <rect x="0" y="0" width="164" height="66" rx="3" fill="var(--surface-1)" stroke="var(--line)" />
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => <path key={`v${index}`} d={`M${index * 16} 1v64`} stroke="var(--line)" strokeWidth=".45" opacity=".65" />)}
          {[1, 2, 3].map((index) => <path key={`h${index}`} d={`M1 ${index * 16}h162`} stroke="var(--line)" strokeWidth=".45" opacity=".65" />)}
          <path d="M5 51h24q10 0 17-6l18-13q8-6 17-6h16q10 0 17 8l13 13q6 6 14 6h18" fill="none" stroke="#a9d0cc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" data-line-rider-track="" />
          <g data-line-rider-sled="">
            <path d="M20 46h24m-20 3h20" fill="none" stroke="#d0a76e" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M27 43l7-8 7 8" fill="none" stroke="var(--game-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="26" cy="34" r="4" fill="var(--game-accent)" stroke="var(--surface-0)" strokeWidth=".8" />
          </g>
        </g>,
      );
    case "idle-clicker":
      return frame(
        <g>
          <rect x="90" y="14" width="140" height="52" rx="10" fill="var(--surface-1)" stroke="var(--line)" />
          <circle cx="118" cy="40" r="15" fill="color-mix(in srgb, var(--game-accent) 24%, var(--surface-0))" stroke="var(--game-accent)" strokeWidth="2" />
          <path d="M118 31v18M111 35h11a4 4 0 0 1 0 8h-9" fill="none" stroke="var(--game-accent)" strokeWidth="2" strokeLinecap="round" />
          <text x="142" y="37" fill="var(--text)" fontSize="12" fontWeight="700">1,248</text>
          <path d="M143 49h36" stroke="var(--game-accent)" strokeWidth="2" strokeLinecap="round" />
          <path d="M181 49h22" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
          <text x="143" y="58" fill="var(--text-muted)" fontSize="6">+12 / sec</text>
          <rect x="195" y="45" width="22" height="13" rx="3" fill="color-mix(in srgb, var(--game-accent) 25%, var(--surface-0))" stroke="var(--line)" />
          <path d="M202 51h8M206 47v8" stroke="var(--game-accent)" strokeWidth="1.5" strokeLinecap="round" />
        </g>,
      );
    case "block-stack":
      return frame(
        <g transform="translate(119 5)">
          <rect x="0" y="0" width="82" height="72" rx="7" fill="var(--surface-1)" stroke="var(--line)" />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <path key={`v${i}`} d={`M${i * 8.2} 0v72`} stroke="var(--line)" opacity=".28" />)}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <path key={`h${i}`} d={`M0 ${i * 8}h82`} stroke="var(--line)" opacity=".28" />)}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const cells = [[4, 8], [5, 8], [6, 8], [6, 9], [7, 9], [8, 9], [1, 10], [2, 10], [3, 10]];
            const [x, y] = cells[i];
            return <rect key={i} x={x * 8.2 + 1} y={y * 8 + 1} width="6.2" height="6" rx="1.5" fill={i === 0 ? "var(--game-accent-strong)" : "color-mix(in srgb, var(--game-accent) 46%, var(--surface-1))"} stroke="var(--game-accent)" strokeWidth=".5" />;
          })}
          <path d="M39 6h24M39 10h17" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" />
          <rect x="34" y="33" width="8" height="8" rx="1.5" fill="var(--game-accent-strong)" opacity=".55" />
          <rect x="42" y="33" width="8" height="8" rx="1.5" fill="var(--game-accent-strong)" opacity=".55" />
          <rect x="50" y="33" width="8" height="8" rx="1.5" fill="var(--game-accent-strong)" opacity=".55" />
          <rect x="42" y="41" width="8" height="8" rx="1.5" fill="var(--game-accent-strong)" opacity=".55" />
        </g>,
      );
    case "minesweeper":
      return frame(
        <g transform="translate(113 8)">
          <rect width="94" height="64" rx="7" fill="var(--surface-1)" stroke="var(--line)" />
          {Array.from({ length: 24 }, (_, index) => {
            const x = (index % 6) * 15.6 + 1.5;
            const y = Math.floor(index / 6) * 15.5 + 1.5;
            const opened = [1, 2, 7, 8, 9, 14, 15, 20].includes(index);
            const mine = [4, 11, 18].includes(index);
            return <g key={index}><rect x={x} y={y} width="13.4" height="13.2" rx="2" fill={opened ? "var(--surface-0)" : "color-mix(in srgb, var(--game-accent) 22%, var(--surface-1))"} stroke="var(--line)" strokeWidth=".7" />{mine ? <><circle cx={x + 6.7} cy={y + 6.3} r="3.5" fill="#d87968" /><path d={`M${x + 6.7} ${y + 1.5}v9.6M${x + 2} ${y + 6.3}h9.4`} stroke="#d87968" strokeWidth=".8" /></> : opened && [7, 8, 14].includes(index) ? <text x={x + 6.7} y={y + 9.3} textAnchor="middle" fill={index === 7 ? "#78a8d5" : index === 8 ? "#79b58d" : "#d08e72"} fontSize="8" fontWeight="700">{index === 7 ? "1" : index === 8 ? "2" : "3"}</text> : !opened && index === 5 ? <path d={`M${x + 4} ${y + 10}V${y + 3}l6 2-6 2`} fill="#d8b56c" stroke="#d8b56c" strokeWidth=".8" /> : null}</g>;
          })}
        </g>,
      );
    case "pong":
      return frame(
        <g>
          <rect x="87" y="10" width="146" height="62" rx="8" fill="var(--surface-1)" stroke="var(--line)" />
          <path d="M160 10v62" stroke="var(--line)" strokeDasharray="3 4" />
          <rect x="102" y="27" width="6" height="24" rx="3" fill="var(--game-accent-strong)" />
          <rect x="212" y="35" width="6" height="24" rx="3" fill="var(--text-muted)" />
          <circle cx="158" cy="37" r="4" fill="var(--text)" />
          <path d="M164 34l21-10" stroke="var(--game-accent)" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x="144" y="25" textAnchor="end" fill="var(--text-muted)" fontSize="8">03</text>
          <text x="176" y="25" fill="var(--text-muted)" fontSize="8">02</text>
          <path d="M114 63h22M185 63h22" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
        </g>,
      );
    case "sudoku":
      return frame(
        <g transform="translate(127 6)">
          <rect width="66" height="66" rx="5" fill="var(--surface-1)" stroke="var(--game-accent)" strokeWidth="1.5" />
          {Array.from({ length: 18 }, (_, index) => {
            const x = index % 9;
            const line = index < 9 ? x : index - 9;
            return <path key={index} d={index < 9 ? `M${line * 7.33} 0v66` : `M0 ${line * 7.33}h66`} stroke="var(--line)" strokeWidth={line % 3 === 0 ? ".8" : ".35"} opacity=".75" />;
          })}
          {[[0, 0, "5"], [1, 0, "2"], [4, 0, "7"], [2, 1, "8"], [6, 1, "1"], [0, 2, "3"], [5, 2, "4"], [2, 4, "1"], [7, 4, "6"], [1, 6, "9"], [5, 7, "2"]].map(([x, y, value]) => <text key={`${x}-${y}`} x={Number(x) * 7.33 + 3.65} y={Number(y) * 7.33 + 5.3} textAnchor="middle" fill={x === 7 && y === 4 ? "var(--game-accent-strong)" : "var(--text)"} fontSize="5" fontWeight={x === 7 && y === 4 ? "700" : "500"}>{value}</text>)}
          <rect x="51.3" y="29.3" width="7.33" height="7.33" fill="color-mix(in srgb, var(--game-accent) 32%, transparent)" stroke="var(--game-accent)" strokeWidth=".8" />
        </g>,
      );
    case "flappy-cube":
      return frame(
        <g>
          <rect x="91" y="10" width="138" height="64" rx="8" fill="var(--surface-1)" stroke="var(--line)" />
          <path d="M92 60h136" stroke="var(--line)" strokeDasharray="2 4" />
          <path d="M111 10h19v20h-19zM111 47h19v27h-19zM190 10h20v30h-20zM190 57h20v17h-20z" fill="color-mix(in srgb, var(--game-accent) 38%, var(--surface-1))" stroke="var(--game-accent)" />
          <rect x="151" y="37" width="17" height="17" rx="4" fill="var(--game-accent-strong)" transform="rotate(-12 159.5 45.5)" />
          <path d="M168 38l18-9" stroke="var(--game-accent)" strokeDasharray="3 3" />
        </g>,
      );
    case "connect-four":
      return frame(
        <g transform="translate(113 8)">
          <rect width="94" height="66" rx="7" fill="var(--game-accent)" stroke="var(--line)" />
          {Array.from({ length: 42 }, (_, index) => {
            const row = Math.floor(index / 7);
            const column = index % 7;
            const red = [[5, 1], [5, 2], [5, 3], [4, 3]];
            const yellow = [[5, 4], [4, 2], [3, 2]];
            const isRed = red.some(([r, c]) => row === r && column === c);
            const isYellow = yellow.some(([r, c]) => row === r && column === c);
            return <circle key={index} cx={7 + column * 13.3} cy={7 + row * 10.3} r="4.1" fill={isRed ? "#d4786d" : isYellow ? "#d3b36d" : "var(--surface-0)"} stroke="color-mix(in srgb, var(--surface-0) 65%, transparent)" strokeWidth=".7" />;
          })}
          <path d="M25 58l14-11 13-10 13-10" fill="none" stroke="var(--text)" strokeWidth="1.2" strokeDasharray="2 3" opacity=".7" />
        </g>,
      );
    case "maze-escape":
      return frame(
        <g transform="translate(129 7)">
          <rect width="62" height="66" rx="4" fill="var(--surface-1)" stroke="var(--line)" />
          <path d="M1 16h13v17H1m13 0h16V9m0 24v16H9m21 0h16V16h15M45 49v16M15 1v15m16 17h14M1 49h8M45 16V1M30 49v16M59 33v16" fill="none" stroke="var(--line)" strokeWidth="2.3" />
          <path d="M5 57h15V40h17V24h19" fill="none" stroke="var(--game-accent)" strokeWidth="2" strokeDasharray="3 2" />
          <circle cx="5" cy="57" r="3" fill="var(--game-accent-strong)" />
          <path d="M55 18l4 5-4 5" fill="none" stroke="#85b994" strokeWidth="2" />
        </g>,
      );
    case "tower-defense":
      return frame(
        <g>
          <path d="M34 22h55v42h65V26h132" fill="none" stroke="var(--line)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M34 22h55v42h65V26h132" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 4" opacity=".6" />
          <g fill="var(--surface-1)" stroke="var(--game-accent)" strokeWidth="2">
            <circle cx="70" cy="48" r="9" /><circle cx="126" cy="38" r="9" /><circle cx="211" cy="47" r="9" />
          </g>
          <path d="M70 42v12m-5-6h10M126 32v12m-5-6h10M211 41v12m-5-6h10" stroke="var(--game-accent)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="244" cy="26" r="6" fill="#d3b36d" />
          <rect x="270" y="15" width="29" height="4" rx="2" fill="var(--surface-1)" /><rect x="270" y="15" width="21" height="4" rx="2" fill="#85b994" />
        </g>,
      );
    case "rhythm-tiles":
      return frame(
        <g transform="translate(91 8)">
          <rect width="138" height="66" rx="8" fill="var(--surface-1)" stroke="var(--line)" />
          {[0, 1, 2, 3].map((lane) => <g key={lane}>
            <rect x={7 + lane * 32} y="5" width="28" height="56" rx="3" fill={lane % 2 ? "var(--surface-0)" : "color-mix(in srgb, var(--game-accent) 6%, var(--surface-0))"} />
            <rect x={10 + lane * 32} y={[22, 7, 40, 13][lane]} width="22" height="7" rx="3" fill="var(--game-accent)" />
            {lane === 1 && <rect x="42" y="37" width="22" height="7" rx="3" fill="var(--game-accent-strong)" />}
          </g>)}
          <path d="M5 49h128" stroke="var(--text)" strokeWidth="1.5" opacity=".7" />
        </g>,
      );
    case "mini-platformer":
      return frame(
        <g>
          <path d="M44 68h63m18-17h58m12-18h82" stroke="var(--line)" strokeWidth="7" strokeLinecap="round" />
          <path d="M54 65h42m40-14h40m37-18h50" stroke="var(--game-accent)" strokeWidth="2" strokeLinecap="round" />
          <rect x="83" y="34" width="19" height="22" rx="4" fill="var(--game-accent)" />
          <circle cx="96" cy="41" r="1.8" fill="var(--surface-0)" />
          <path d="M168 42l7-12 7 12z" fill="#d4786d" />
          <circle cx="224" cy="23" r="5" fill="#d3b36d" />
          <path d="M278 20v39m-9 0h18" stroke="#85b994" strokeWidth="2" strokeLinecap="round" />
        </g>,
      );
    case "perfect-stack":
      return frame(
        <g transform="translate(104 8)">
          <path d="M22 66h104" stroke="var(--line)" strokeWidth="2" />
          <rect x="44" y="54" width="60" height="9" rx="2" fill="color-mix(in srgb, var(--game-accent) 38%, var(--surface-1))" />
          <rect x="50" y="43" width="48" height="9" rx="2" fill="color-mix(in srgb, var(--game-accent) 54%, var(--surface-1))" />
          <rect x="55" y="32" width="38" height="9" rx="2" fill="var(--game-accent)" />
          <rect x="78" y="18" width="38" height="9" rx="2" fill="var(--game-accent-strong)" opacity=".82" />
          <path d="M34 22h30m-5-4 5 4-5 4" fill="none" stroke="var(--text-muted)" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
        </g>,
      );
    case "laser-mirrors":
      return frame(
        <g>
          <rect x="96" y="8" width="128" height="66" rx="6" fill="var(--surface-1)" stroke="var(--line)" />
          <path d="M103 24h36l13 13h31V23h28" fill="none" stroke="var(--game-accent)" strokeWidth="2" />
          <path d="M103 57h22l14-14h44" fill="none" stroke="#d4aa71" strokeWidth="1.5" />
          <path d="M136 19l10 10m34-11 10 10M135 40l10 10" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="99" y="19" width="7" height="10" rx="2" fill="var(--game-accent-strong)" />
          <rect x="99" y="52" width="7" height="10" rx="2" fill="#d4aa71" />
          <circle cx="219" cy="23" r="4" fill="none" stroke="#86bc96" strokeWidth="1.5" />
          <circle cx="183" cy="57" r="4" fill="none" stroke="#86bc96" strokeWidth="1.5" />
          <rect x="161" y="47" width="7" height="7" rx="1" fill="var(--text-muted)" opacity=".55" />
        </g>,
      );
    case "pixel-crossing":
      return frame(
        <g transform="translate(97 8)">
          <rect width="126" height="66" rx="6" fill="#293d34" stroke="var(--line)" />
          <path d="M1 21h124v21H1z" fill="#30373b" />
          <path d="M1 21h124M1 42h124" stroke="#d4b777" strokeOpacity=".55" />
          <path d="M1 50q12-4 24 0t24 0 24 0 24 0 24 0" fill="none" stroke="#a9d0cc" strokeOpacity=".65" />
          <rect x="14" y="26" width="28" height="10" rx="3" fill="#c9776a" />
          <rect x="77" y="26" width="34" height="10" rx="3" fill="#d0a76e" />
          <rect x="6" y="46" width="35" height="11" rx="5" fill="#806247" />
          <path d="M12 50h23" stroke="#b89971" strokeOpacity=".7" />
          <ellipse cx="63" cy="58" rx="7" ry="3" fill="#101614" opacity=".55" />
          <circle cx="63" cy="51" r="7" fill="#92b39a" stroke="var(--game-accent)" strokeWidth="1.5" />
          <circle cx="61" cy="50" r="1.2" fill="#f0ead6" /><circle cx="65" cy="50" r="1.2" fill="#f0ead6" />
        </g>,
      );
    case "crossword-infinite":
      return frame(
        <g transform="translate(130 7)">
          {Array.from({ length: 25 }, (_, index) => {
            const row = Math.floor(index / 5);
            const column = index % 5;
            const open = [[0, 0], [0, 1], [0, 3], [0, 4], [1, 0], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 2], [3, 4], [4, 0], [4, 2], [4, 3], [4, 4]];
            const active = open.some(([r, c]) => r === row && c === column);
            return <g key={index}><rect x={column * 13} y={row * 13} width="12" height="12" fill={active ? "var(--surface-1)" : "var(--game-accent-strong)"} stroke="var(--line)" strokeWidth=".7" />{active && <text x={column * 13 + 6} y={row * 13 + 8.5} textAnchor="middle" fill="var(--game-accent)" fontSize="6" fontWeight="700">{["K", "R", "E", "U", "Z"][row]}</text>}</g>;
          })}
          <path d="M75 11h30M75 25h23M75 39h35M75 53h25" stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
          <path d="M75 11h19M75 25h13M75 39h25M75 53h17" stroke="var(--game-accent)" strokeWidth="1.4" strokeLinecap="round" />
        </g>,
      );
    case "color-ludo":
      return frame(
        <g transform="translate(126 6)">
          <rect x="3" y="2" width="64" height="64" rx="8" fill="var(--surface-1)" stroke="var(--line)" />
          <path d="M27 4h16v16h8v8h16v16H51v8h-8v16H27V52h-8v-8H3V28h16v-8h8z" fill="var(--surface-0)" stroke="var(--line)" strokeWidth=".8" />
          <path d="M28 5h14v14H28zM5 28h14v14H5zM51 28h14v14H51zM28 51h14v14H28z" fill="var(--game-accent)" opacity=".38" />
          <path d="M35 21v29M21 35h29" stroke="var(--line)" strokeWidth=".8" />
          <path d="M35 30l5 5-5 5-5-5z" fill="var(--game-accent)" opacity=".8" />
          <circle cx="35" cy="24" r="3" fill="#da8471" /><circle cx="46" cy="35" r="3" fill="#75a99e" />
          <circle cx="35" cy="46" r="3" fill="#d6b568" /><circle cx="24" cy="35" r="3" fill="#aa8db9" />
          <circle cx="8" cy="12" r="3" fill="#da8471" /><circle cx="62" cy="12" r="3" fill="#75a99e" />
          <circle cx="8" cy="58" r="3" fill="#d6b568" /><circle cx="62" cy="58" r="3" fill="#aa8db9" />
        </g>,
      );
    case "color-clash":
      return frame(
        <g transform="translate(104 7)">
          <rect x="7" y="12" width="31" height="48" rx="5" transform="rotate(-12 22.5 36)" fill="#cf665f" stroke="#fff" strokeWidth="1.2" />
          <rect x="31" y="8" width="31" height="48" rx="5" transform="rotate(7 46.5 32)" fill="#4e83bc" stroke="#fff" strokeWidth="1.2" />
          <rect x="55" y="14" width="31" height="48" rx="5" transform="rotate(15 70.5 38)" fill="#51946e" stroke="#fff" strokeWidth="1.2" />
          <text x="22" y="43" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="800">7</text>
          <text x="47" y="38" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="800">↻</text>
          <text x="71" y="45" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="800">+2</text>
          <rect x="86" y="11" width="31" height="48" rx="5" transform="rotate(5 101.5 35)" fill="#f3efe3" stroke="var(--game-accent)" strokeWidth="1.2" />
          <path d="M92 20h10v13H92z" fill="#cf665f" /><path d="M102 20h10v13h-10z" fill="#4e83bc" />
          <path d="M92 33h10v13H92z" fill="#51946e" /><path d="M102 33h10v13h-10z" fill="#d2a83c" />
          <text x="102" y="55" textAnchor="middle" fill="#252525" fontSize="6" fontWeight="700">WILD</text>
        </g>,
      );
    case "hex-settlers": {
      const coordinates = Array.from({ length: 25 }, (_, index) => {
        const q = Math.floor(index / 5) - 2;
        const r = (index % 5) - 2;
        return { q, r };
      }).filter(({ q, r }) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2);
      const terrains = ["#6d9477", "#778f6c", "#c69b76", "#b2a46d", "#8d7868", "#72a080", "#8c9c72", "#b18d72", "#98a878", "#657f70", "#c4a174", "#7d9879", "#82966b", "#9d806e", "#8ba17c", "#997e69", "#769377", "#a9a071", "#c6b67d"];
      const highlighted = [2, 5, 9, 13, 16];
      return frame(
        <g transform="translate(104 4)">
          {coordinates.map(({ q, r }, index) => {
            const cx = 56 + q * 17;
            const cy = 38 + (r + q / 2) * 19;
            const points = Array.from({ length: 6 }, (_, corner) => {
              const angle = corner * Math.PI / 3;
              return `${cx + Math.cos(angle) * 10},${cy + Math.sin(angle) * 11}`;
            }).join(" ");
            return (
              <g key={`${q},${r}`}>
                <polygon points={points} fill={terrains[index]} stroke="var(--surface-0)" strokeWidth="1" />
                {index !== 18 && <><circle cx={cx} cy={cy} r="4.3" fill="#f3ead8" stroke="#766954" strokeWidth=".6" /><text x={cx} y={cy + 1.8} textAnchor="middle" fill="#31302b" fontSize="4.8" fontWeight="700">{[5, 9, 4, 10, 6, 3, 11, 8, 4, 10, 9, 12, 5, 6, 3, 11, 8, 2][index]}</text></>}
              </g>
            );
          })}
          {highlighted.map((index) => {
            const { q, r } = coordinates[index];
            const cx = 56 + q * 17;
            const cy = 38 + (r + q / 2) * 19;
            return <path key={index} d={`M${cx} ${cy}l8 5`} stroke="#e9ddc9" strokeWidth="2.2" strokeLinecap="round" />;
          })}
          <path d="M56 38l8 5m-8 0l-5 8m5-8l-8-4" stroke="#e9ddc9" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M52 27l4-4 4 4v5h-8zM67 45l4-4 4 4v5h-8zM42 54l4-4 4 4v5h-8z" fill="var(--game-accent)" stroke="var(--surface-0)" strokeWidth="1" />
        </g>,
      );
    }
    case "chess":
      return frame(
        <g data-thumbnail-artwork="chess" transform="translate(124 5)">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => [0, 1, 2, 3, 4, 5, 6, 7].map((column) => (
            <rect
              key={`${row}-${column}`}
              x={column * 9}
              y={row * 9}
              width="9"
              height="9"
              fill={(row + column) % 2 ? "#83918b" : "#eee8d8"}
              data-chess-square=""
            />
          )))}
          <rect x="-.5" y="-.5" width="73" height="73" fill="none" stroke="var(--game-accent)" strokeWidth=".8" />
          {[
            { row: 0, pieces: ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"], fill: "#263038" },
            { row: 1, pieces: Array(8).fill("♟"), fill: "#263038" },
            { row: 6, pieces: Array(8).fill("♟"), fill: "#fffdf5" },
            { row: 7, pieces: ["♖", "♘", "♗", "♕", "♔", "♗", "♘", "♖"], fill: "#fffdf5" },
          ].flatMap(({ row, pieces, fill }) => pieces.map((piece, column) => (
            <text
              key={`${row}-${column}`}
              x={column * 9 + 4.5}
              y={row * 9 + 7.4}
              textAnchor="middle"
              fill={fill}
              stroke={fill === "#fffdf5" ? "#263038" : "none"}
              strokeWidth=".25"
              paintOrder="stroke"
              fontFamily='"Segoe UI Symbol", "Apple Symbols", serif'
              fontSize="8.5"
              data-chess-piece=""
            >{piece}</text>
          )))}
        </g>,
      );
  }
}

export function ArcadeThumbnail({ gameId, label }: { gameId: GameId; label: string }) {
  return (
    <svg
      aria-label={label}
      className="arcade-thumbnail"
      data-game-thumbnail={gameId}
      role="img"
      viewBox="0 0 320 82"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{label}</title>
      <ThumbnailArtwork gameId={gameId} />
    </svg>
  );
}
