// Заменяет пакет memory из libXray (scripts/build_core.sh кладёт этот файл
// вместо memory_ios.go и memory_other.go).
//
// В оригинале на iOS лимит памяти Go жёстко равен 30 МБ. Здесь он
// настраивается из приложения: конфиг Xray передаёт переменные через
// секцию "env", ядро выставляет их при разборе конфига, а этот цикл раз в
// секунду читает их и применяет.
//
//	BPROXY_MEMORY_LIMIT_MB  лимит в мегабайтах, 0 — без лимита
//	BPROXY_AGGRESSIVE_GC    "1" — частая сборка мусора и возврат памяти ОС
package memory

import (
	"math"
	"os"
	"runtime"
	"runtime/debug"
	"strconv"
	"sync"
	"time"
)

var once sync.Once

// На iOS расширению доступно около 50 МБ, поэтому без настройки — 30 МБ и частая сборка.
func defaults() (int64, bool) {
	if runtime.GOOS == "ios" {
		return 30, true
	}
	return 0, false
}

func current() (int64, bool) {
	limit, aggressive := defaults()
	if v, err := strconv.ParseInt(os.Getenv("BPROXY_MEMORY_LIMIT_MB"), 10, 64); err == nil && v >= 0 {
		limit = v
	}
	if v := os.Getenv("BPROXY_AGGRESSIVE_GC"); v != "" {
		aggressive = v == "1" || v == "true"
	}
	return limit, aggressive
}

func apply(limit int64, aggressive bool) {
	if limit > 0 {
		debug.SetMemoryLimit(limit * 1024 * 1024)
	} else {
		debug.SetMemoryLimit(math.MaxInt64)
	}
	if aggressive {
		debug.SetGCPercent(10)
	} else {
		debug.SetGCPercent(100)
	}
}

func InitForceFree() {
	once.Do(func() {
		limit, aggressive := current()
		apply(limit, aggressive)
		go func() {
			for {
				time.Sleep(time.Second)
				l, a := current()
				if l != limit || a != aggressive {
					limit, aggressive = l, a
					apply(limit, aggressive)
				}
				if aggressive {
					debug.FreeOSMemory()
				}
			}
		}()
	})
}
