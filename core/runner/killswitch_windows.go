//go:build windows

package main

// Windows: kill switch — фильтры WFP самого Xray (autoSystemWfpBlockLeak в конфиге),
// они живут, пока работает ядро. Здесь делать нечего.
func markOwnSockets()                     {}
func killSwitchOn(killSwitchConfig) error { return nil }
func killSwitchOff() error                { return nil }
