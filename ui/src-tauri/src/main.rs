// Не открывать консоль рядом с окном в релизной сборке Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    b_proxy_lib::run()
}
