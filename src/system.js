// Загрузка процессора, память, диск и время работы Windows
import fs from 'node:fs'
import os from 'node:os'

const systemDrive = `${process.env.SystemDrive ?? 'C:'}\\`
let lastCpu = null

function cpuTimes() {
    let idle = 0
    let total = 0
    for (const cpu of os.cpus()) {
        for (const time of Object.values(cpu.times)) total += time
        idle += cpu.times.idle
    }
    return { idle, total }
}

// Загрузка процессора считается между двумя вызовами, поэтому вызывать раз в секунду
export function sampleSystem() {
    const cpu = cpuTimes()
    let cpuPercent = 0
    if (lastCpu && cpu.total > lastCpu.total) {
        cpuPercent = Math.round(100 * (1 - (cpu.idle - lastCpu.idle) / (cpu.total - lastCpu.total)))
    }
    lastCpu = cpu

    let disk = null
    try {
        const stats = fs.statfsSync(systemDrive)
        disk = { drive: systemDrive.slice(0, 1), total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize }
    } catch {
        // Диск недоступен
    }
    const total = os.totalmem()
    return {
        cpu: Math.min(100, Math.max(0, cpuPercent)),
        ram: { used: total - os.freemem(), total },
        disk,
        uptime: Math.round(os.uptime()),
    }
}
