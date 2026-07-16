/*
 * @Author: AI Assistant
 * @Date: 2026-07-16
 * @Description: 时间轴滑块组件 - 用于按时间播放渲染数据
 */
<template>
  <div id="timeline-container" class="timeline-container" :class="{ collapsed: isCollapsed }">
    <!-- 折叠状态：显示一个小按钮 -->
    <div v-if="isCollapsed" class="timeline-collapsed" @click="expandTimeline">
      <span class="collapsed-icon">⏱</span>
    </div>
    
    <!-- 展开状态：显示完整时间轴 -->
    <template v-else>
      <!-- 右上角控制栏 -->
      <div class="timeline-controls-top">
        <!-- 步长设置 -->
        <div class="step-control">
          <span class="step-label">步长</span>
          <div class="step-buttons">
            <button 
              v-for="step in stepOptions" 
              :key="step.value"
              :class="['step-btn', { active: stepHours === step.value }]"
              @click="setStep(step.value)"
            >
              {{ step.label }}
            </button>
          </div>
        </div>
        
        <!-- 播放按钮 -->
        <button class="control-btn play-btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
          <span v-if="isPlaying" class="icon-pause">⏸</span>
          <span v-else class="icon-play">▶</span>
        </button>
        
        <!-- 加载状态 -->
        <div class="loading-indicator" v-if="isLoading">
          <span class="loading-spinner"></span>
        </div>
        
        <!-- 折叠按钮 -->
        <button class="control-btn collapse-btn" @click="collapseTimeline" title="折叠">−</button>
      </div>
      
      <!-- 时间轴主体 -->
      <div class="timeline-body">
        <!-- 时间范围标签 -->
        <div class="timeline-labels">
          <span class="timeline-time-label">{{ formatTime(startTime) }}</span>
          <span class="timeline-time-label timeline-end-label">{{ formatTime(endTime) }}</span>
        </div>
        
        <!-- 滑块区域 -->
        <div class="timeline-slider-wrapper">
          <div class="timeline-track">
            <div class="timeline-progress" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <input 
            type="range" 
            class="timeline-slider" 
            :min="minTimestamp" 
            :max="maxTimestamp" 
            :step="stepHours * 3600 * 1000"
            v-model="currentTimestamp"
            @input="onSliderChange"
            @mousedown="onSliderStart"
            @touchstart="onSliderStart"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script>
export default {
  name: 'TimelineSlider',
  props: {
    defaultStepHours: {
      type: Number,
      default: 1
    },
    defaultRangeDays: {
      type: Number,
      default: 7
    }
  },
  data() {
    return {
      isVisible: true,
      isCollapsed: false,
      stepHours: this.defaultStepHours,
      stepOptions: [
        { value: 1, label: '1h' },
        { value: 3, label: '3h' },
        { value: 6, label: '6h' },
        { value: 12, label: '12h' },
        { value: 24, label: '1d' }
      ],
      startTime: null,
      endTime: null,
      currentTime: null,
      minTimestamp: 0,
      maxTimestamp: 0,
      currentTimestamp: 0,
      isPlaying: false,
      isLoading: false,
      playInterval: null,
      isDragging: false,
      debounceTimer: null,
      debounceDelay: 500
    }
  },
  computed: {
    progressPercent() {
      if (this.maxTimestamp === this.minTimestamp) return 0
      return ((this.currentTimestamp - this.minTimestamp) / (this.maxTimestamp - this.minTimestamp)) * 100
    }
  },
  mounted() {
    this.initTimeline()
  },
  beforeDestroy() {
    this.stopPlay()
    if (this.playInterval) {
      clearInterval(this.playInterval)
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
  },
  methods: {
    initTimeline() {
      const now = new Date()
      this.endTime = new Date(now)
      this.startTime = new Date(now.getTime() - this.defaultRangeDays * 24 * 3600 * 1000)
      
      this.endTime.setMinutes(0, 0, 0)
      this.startTime.setMinutes(0, 0, 0)
      
      this.minTimestamp = this.startTime.getTime()
      this.maxTimestamp = this.endTime.getTime()
      this.currentTime = new Date(this.endTime)
      this.currentTimestamp = this.currentTime.getTime()
    },
    
    setCurrentTime(date, hour) {
      if (!date || date === 'current') {
        this.currentTime = new Date()
      } else {
        const parts = date.split('/')
        const hours = hour ? parseInt(hour.substring(0, 2)) : 0
        this.currentTime = new Date(
          parseInt(parts[0]),
          parseInt(parts[1]) - 1,
          parseInt(parts[2]),
          hours
        )
      }
      this.currentTimestamp = this.currentTime.getTime()
      
      if (this.currentTimestamp < this.minTimestamp) {
        this.minTimestamp = this.currentTimestamp - 24 * 3600 * 1000
        this.startTime = new Date(this.minTimestamp)
      }
      if (this.currentTimestamp > this.maxTimestamp) {
        this.maxTimestamp = this.currentTimestamp + 24 * 3600 * 1000
        this.endTime = new Date(this.maxTimestamp)
      }
    },
    
    formatTime(date) {
      if (!date) return '--'
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      return `${month}-${day} ${hours}:00`
    },
    
    formatTimeFull(date) {
      if (!date) return '----/--/-- --:--'
      const yyyy = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      return `${yyyy}/${month}/${day} ${hours}:00`
    },
    
    formatFullTime(date) {
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      const hh = String(date.getHours()).padStart(2, '0')
      return {
        date: `${yyyy}/${mm}/${dd}`,
        hour: `${hh}00`
      }
    },
    
    onSliderChange() {
      this.currentTime = new Date(parseInt(this.currentTimestamp))
    },
    
    onSliderStart() {
      this.isDragging = true
      this.stopPlay()
      
      this.$nextTick(() => {
        document.addEventListener('mouseup', this.onSliderEnd)
        document.addEventListener('touchend', this.onSliderEnd)
      })
    },
    
    onSliderEnd() {
      this.isDragging = false
      document.removeEventListener('mouseup', this.onSliderEnd)
      document.removeEventListener('touchend', this.onSliderEnd)
      
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }
      this.debounceTimer = setTimeout(() => {
        this.emitTimeChange()
      }, this.debounceDelay)
    },
    
    setStep(value) {
      this.stepHours = value
      const alignedTime = this.alignToStep(this.currentTime)
      this.currentTime = alignedTime
      this.currentTimestamp = alignedTime.getTime()
      this.emitTimeChange()
    },
    
    onStepChange() {
      const alignedTime = this.alignToStep(this.currentTime)
      this.currentTime = alignedTime
      this.currentTimestamp = alignedTime.getTime()
      this.emitTimeChange()
    },
    
    alignToStep(date) {
      const ms = date.getTime()
      const stepMs = this.stepHours * 3600 * 1000
      const aligned = Math.round(ms / stepMs) * stepMs
      return new Date(aligned)
    },
    
    emitTimeChange() {
      const timeConfig = this.formatFullTime(this.currentTime)
      this.$emit('time-change', {
        date: timeConfig.date,
        hour: timeConfig.hour,
        timestamp: this.currentTimestamp
      })
      this.lastEmittedTime = this.currentTimestamp
    },
    
    togglePlay() {
      if (this.isPlaying) {
        this.stopPlay()
      } else {
        this.startPlay()
      }
    },
    
    startPlay() {
      if (this.isPlaying) return
      this.isPlaying = true
      this.emitTimeChange()
    },
    
    stopPlay() {
      this.isPlaying = false
      if (this.playInterval) {
        clearTimeout(this.playInterval)
        this.playInterval = null
      }
    },
    
    // 播放间隔结束后调用此方法继续播放
    continuePlay() {
      if (!this.isPlaying) return
      
      let nextTimestamp = this.currentTimestamp + this.stepHours * 3600 * 1000
      
      if (nextTimestamp > this.maxTimestamp) {
        nextTimestamp = this.minTimestamp
      }
      
      this.currentTimestamp = nextTimestamp
      this.currentTime = new Date(nextTimestamp)
      
      this.emitTimeChange()
    },
    
    // 数据加载完成回调（由父组件调用）
    onDataLoaded() {
      this.isLoading = false
      if (this.isPlaying) {
        // 加载成功后等待5秒再继续
        this.playInterval = setTimeout(() => {
          this.continuePlay()
        }, 5000)
      }
    },
    
    toggleVisibility() {
      this.isVisible = !this.isVisible
      this.stopPlay()
      this.$emit('visibility-change', this.isVisible)
    },
    
    collapseTimeline() {
      this.isCollapsed = true
      this.$emit('collapse-change', true)
    },
    
    expandTimeline() {
      this.isCollapsed = false
      this.$emit('collapse-change', false)
    },
    
    show() {
      this.isVisible = true
      this.isCollapsed = false
    },
    
    hide() {
      this.isVisible = false
      this.stopPlay()
    },
    
    getStepHours() {
      return this.stepHours
    },
    
    setRange(startDate, endDate) {
      this.startTime = new Date(startDate)
      this.endTime = new Date(endDate)
      this.minTimestamp = this.startTime.getTime()
      this.maxTimestamp = this.endTime.getTime()
    }
  }
}
</script>

<style scoped lang="scss">
.timeline-container {
  position: fixed;
  bottom: 20px;
  right: 2%;
  background: linear-gradient(135deg, rgba(15, 25, 50, 0.95) 0%, rgba(25, 40, 80, 0.9) 100%);
  border-radius: 12px;
  border: 1px solid rgba(100, 150, 255, 0.3);
  padding: 12px 16px;
  pointer-events: all;
  z-index: 1000;
  min-width: 450px;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 0 40px rgba(50, 100, 200, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  
  // 折叠状态
  &.collapsed {
    position: fixed;
    top: auto;
    bottom: 20px;
    right: 2%;
    min-width: auto;
    padding: 0;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    background: linear-gradient(135deg, rgba(15, 25, 50, 0.95) 0%, rgba(25, 40, 80, 0.9) 100%);
    border: 1px solid rgba(100, 150, 255, 0.3);
    
    .timeline-collapsed {
      display: flex;
    }
  }
  
  // 折叠后的小按钮
  .timeline-collapsed {
    display: none;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    cursor: pointer;
    
    .collapsed-icon {
      font-size: 1.2rem;
      filter: drop-shadow(0 0 4px rgba(74, 144, 217, 0.5));
    }
  }
  
  // 右上角控制栏
  .timeline-controls-top {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(100, 150, 255, 0.15);
    
    .control-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: #fff;
      cursor: pointer;
      transition: all 0.2s ease;
      
      &:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.4);
        transform: translateY(-1px);
      }
      
      &:active {
        transform: translateY(0);
      }
    }
    
    .play-btn {
      width: 32px;
      height: 32px;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
      border-color: #5ba0e9;
      box-shadow: 0 2px 10px rgba(74, 144, 217, 0.4);
      
      &:hover {
        background: linear-gradient(135deg, #5ba0e9 0%, #4a90d9 100%);
        box-shadow: 0 4px 15px rgba(74, 144, 217, 0.6);
      }
    }
    
    .step-control {
      display: flex;
      align-items: center;
      gap: 8px;
      
      .step-label {
        color: rgba(180, 200, 230, 0.8);
        font-size: 0.75rem;
        font-weight: 500;
      }
      
      .step-buttons {
        display: flex;
        gap: 3px;
        
        .step-btn {
          padding: 4px 8px;
          font-size: 0.7rem;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          color: rgba(180, 200, 230, 0.9);
          cursor: pointer;
          transition: all 0.2s ease;
          
          &:hover {
            background: rgba(255, 255, 255, 0.15);
            color: #fff;
          }
          
          &.active {
            background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
            border-color: #5ba0e9;
            color: #fff;
            box-shadow: 0 2px 8px rgba(74, 144, 217, 0.4);
          }
        }
      }
    }
    
    .loading-indicator {
      display: flex;
      align-items: center;
      
      .loading-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(74, 144, 217, 0.3);
        border-top-color: #4a90d9;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
    }
    
    .collapse-btn {
      width: 26px;
      height: 26px;
      font-size: 1rem;
      font-weight: bold;
      padding: 0;
      
      &:hover {
        background: rgba(255, 200, 80, 0.3);
        border-color: rgba(255, 200, 100, 0.5);
      }
    }
  }
  
  .timeline-body {
    .timeline-labels {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      
      .timeline-time-label {
        color: rgba(180, 200, 230, 0.6);
        font-size: 0.7rem;
        font-weight: 500;
        letter-spacing: 0.5px;
        
        &.timeline-end-label {
          text-align: right;
        }
      }
    }
    
    .timeline-slider-wrapper {
      position: relative;
      height: 16px;
      display: flex;
      align-items: center;
      
      .timeline-track {
        position: absolute;
        width: 100%;
        height: 5px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
        
        .timeline-progress {
          height: 100%;
          background: linear-gradient(90deg, #4a90d9 0%, #67b3e8 50%, #e2b42e 100%);
          border-radius: 3px;
          transition: width 0.1s ease-out;
          box-shadow: 0 0 8px rgba(74, 144, 217, 0.4);
        }
      }
      
      .timeline-slider {
        width: 100%;
        height: 16px;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        cursor: pointer;
        position: relative;
        z-index: 2;
        
        &::-webkit-slider-runnable-track {
          height: 5px;
          background: transparent;
          border-radius: 3px;
        }
        
        &::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fff 0%, #e0e0e0 100%);
          cursor: pointer;
          border: 2px solid #4a90d9;
          box-shadow: 
            0 1px 5px rgba(0, 0, 0, 0.3),
            0 0 10px rgba(74, 144, 217, 0.4);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          
          &:hover {
            transform: scale(1.15);
            box-shadow: 
              0 2px 8px rgba(0, 0, 0, 0.35),
              0 0 15px rgba(74, 144, 217, 0.5);
          }
        }
        
        &::-moz-range-track {
          height: 5px;
          background: transparent;
          border-radius: 3px;
        }
        
        &::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fff 0%, #e0e0e0 100%);
          cursor: pointer;
          border: 2px solid #4a90d9;
          box-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
        }
        
        &:focus {
          outline: none;
        }
      }
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// 响应式适配
@media (max-width: 825px), (max-height: 700px) {
  .timeline-container {
    right: 1%;
    min-width: auto;
    padding: 8px 12px;
    
    &.collapsed {
      width: 40px;
      height: 40px;
    }
    
    .timeline-controls-top {
      gap: 8px;
      
      .step-control {
        .step-buttons {
          .step-btn {
            padding: 3px 5px;
            font-size: 0.65rem;
          }
        }
      }
    }
  }
}
</style>
