import { describe, expect, test } from "bun:test";
import { add } from "./index";

describe("add", () => {
	test("正の数同士の足し算", () => {
		expect(add(2, 3)).toBe(5);
	});

	test("負の数を含む足し算", () => {
		expect(add(-1, 1)).toBe(0);
	});

	test("0を含む足し算", () => {
		expect(add(0, 5)).toBe(5);
	});
});
